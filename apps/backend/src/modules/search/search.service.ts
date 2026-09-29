import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  SearchDocument,
  SearchDocumentRecord,
  fromSearchDocumentRecord,
} from '@golden-abode/types';

import { RedisService } from '../../core/redis/redis.service';
import { CityResolverService } from '../catalog/city-resolver.service';
import { MeiliClient } from './meili/meili.client';
import { PostgresSearchService } from './fallback/postgres-search.service';

// Phase 6g (decision 0021, search-system-design.md section 6).
//
// Orchestration and the fallback decision. Three rules this encodes:
//
//   1. CITY IS RESOLVED SERVER-SIDE, ALWAYS, BEFORE ANY QUERY. The client
//      never supplies city_id. A tampered or stale client-side value would
//      leak cross-city results — precisely what decision 0018 exists to
//      prevent.
//   2. SEARCH DEGRADES, IT DOES NOT 500. If Meilisearch is unreachable or
//      errors, the same query runs against Postgres and the caller cannot
//      tell the difference from the response shape.
//   3. BOTH ENGINES RETURN SearchDocument[]. The engine is an implementation
//      detail, not part of the contract.

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'search:v1:';

export type SearchRequest = {
  query?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  categoryPath?: string;
  brand?: string;
  attributes?: Record<string, string>;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
};

export type SearchResponse = {
  cityId: string | null;
  resolvedVia: 'coordinates' | 'pincode' | 'none';
  engine: 'meilisearch' | 'postgres';
  // True when Meilisearch was the configured engine but did not answer, so
  // Postgres served the request instead. Surfaced rather than hidden: an
  // outage that nobody notices is an outage nobody fixes.
  degraded: boolean;
  total: number;
  hits: SearchDocument[];
  // True when this response came from the Redis cache and neither engine was
  // queried. Distinguishes "Meilisearch is healthy" from "we did not ask it".
  servedFromCache: boolean;
  facets?: Record<string, Record<string, number>>;
};

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly cityResolver: CityResolverService,
    private readonly meili: MeiliClient,
    private readonly postgres: PostgresSearchService,
  ) {}

  async search(req: SearchRequest): Promise<SearchResponse> {
    // 1. City first — one Postgres call per request, before the engine is
    //    touched at all.
    const resolution = await this.cityResolver.resolveCity({
      pincode: req.pincode,
      latitude: req.latitude,
      longitude: req.longitude,
    });

    if (resolution.disagreedWithPincode) {
      // Decision 0019 accepts this as a residual risk rather than hiding it,
      // so it is logged to be monitored, not swallowed.
      this.logger.warn(
        `City resolution disagreement: pincode=${req.pincode} lat=${req.latitude} lng=${req.longitude} -> ${resolution.cityId} (coordinates won)`,
      );
    }

    // No city means no results — there is deliberately no "search all cities"
    // mode, because that would contradict the business model, not merely be
    // an unimplemented feature (0018).
    if (!resolution.cityId) {
      return {
        cityId: null,
        resolvedVia: resolution.resolvedVia,
        engine: this.configuredEngine(),
        degraded: false,
        servedFromCache: false,
        total: 0,
        hits: [],
      };
    }

    const cityId = resolution.cityId;
    const cacheKey = this.cacheKey(req, cityId);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      // `engine` and `degraded` are replayed from the cached entry because
      // they describe how these HITS were produced, which is what they are
      // for. `servedFromCache` is what tells a caller this request did not
      // touch either engine — without it, a cached `degraded: false` reads as
      // a live all-clear and would mask an ongoing outage.
      return {
        ...cached,
        cityId,
        resolvedVia: resolution.resolvedVia,
        servedFromCache: true,
      };
    }

    let response: SearchResponse;

    if (this.configuredEngine() === 'meilisearch') {
      try {
        response = await this.searchMeili(req, cityId, resolution.resolvedVia);
      } catch (err) {
        // Rule 2: degrade, do not 500.
        this.logger.error(
          `Meilisearch query failed, falling back to Postgres: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        response = await this.searchPostgres(req, cityId, resolution.resolvedVia, true);
      }
    } else {
      response = await this.searchPostgres(req, cityId, resolution.resolvedVia, false);
    }

    // Only cache a healthy result. Caching a degraded one would extend an
    // outage past its actual duration.
    if (!response.degraded) {
      await this.writeCache(cacheKey, response);
    }

    return response;
  }

  private configuredEngine(): 'meilisearch' | 'postgres' {
    return this.config.get<string>('search.engine') === 'postgres' ? 'postgres' : 'meilisearch';
  }

  private async searchMeili(
    req: SearchRequest,
    cityId: string,
    resolvedVia: SearchResponse['resolvedVia'],
  ): Promise<SearchResponse> {
    const filters = this.buildMeiliFilters(req, cityId);

    const result = await this.meili.index().search(req.query ?? '', {
      filter: filters,
      limit: req.limit ?? 20,
      offset: req.offset ?? 0,
      // Facets are a QUERY-TIME parameter in Meilisearch, not an index-time
      // structure — the distribution returned is scoped to this result set.
      facets: ['category_path', 'brand'],
    });

    return {
      cityId,
      resolvedVia,
      engine: 'meilisearch',
      degraded: false,
      servedFromCache: false,
      total: result.estimatedTotalHits ?? result.hits.length,
      hits: (result.hits as unknown as SearchDocumentRecord[]).map(fromSearchDocumentRecord),
      facets: result.facetDistribution as Record<string, Record<string, number>> | undefined,
    };
  }

  private async searchPostgres(
    req: SearchRequest,
    cityId: string,
    resolvedVia: SearchResponse['resolvedVia'],
    degraded: boolean,
  ): Promise<SearchResponse> {
    const hits = await this.postgres.search({
      query: req.query,
      cityId,
      categoryPath: req.categoryPath,
      brand: req.brand,
      attributes: req.attributes,
      minPrice: req.minPrice,
      maxPrice: req.maxPrice,
      limit: req.limit,
      offset: req.offset,
    });

    return {
      cityId,
      resolvedVia,
      engine: 'postgres',
      degraded,
      servedFromCache: false,
      total: hits.length,
      hits,
      // Facets are deliberately absent on the Postgres path rather than
      // faked: computing them would mean a second aggregate query per
      // request, and this path exists for availability, not feature parity.
    };
  }

  // city_id is ALWAYS present in this filter. Never optional, never client-set.
  private buildMeiliFilters(req: SearchRequest, cityId: string): string[] {
    const filters: string[] = [`city_id = "${cityId}"`];

    if (req.categoryPath) {
      // Match the category itself or anything beneath it, mirroring the
      // Postgres path's prefix match so the two engines agree.
      filters.push(
        `(category_path = "${req.categoryPath}" OR category_path STARTS WITH "${req.categoryPath}/")`,
      );
    }
    if (req.brand) filters.push(`brand = "${req.brand}"`);
    if (req.minPrice !== undefined) filters.push(`price >= ${req.minPrice}`);
    if (req.maxPrice !== undefined) filters.push(`price <= ${req.maxPrice}`);

    for (const [key, value] of Object.entries(req.attributes ?? {})) {
      filters.push(`attributes.${key} = "${value}"`);
    }

    return filters;
  }

  // Key includes the resolved city_id and every filter, so two cities never
  // share a cached page.
  private cacheKey(req: SearchRequest, cityId: string): string {
    const normalised = JSON.stringify({
      q: (req.query ?? '').trim().toLowerCase(),
      city: cityId,
      cat: req.categoryPath ?? '',
      brand: req.brand ?? '',
      attrs: Object.entries(req.attributes ?? {}).sort(),
      min: req.minPrice ?? null,
      max: req.maxPrice ?? null,
      limit: req.limit ?? 20,
      offset: req.offset ?? 0,
    });
    return CACHE_PREFIX + createHash('sha1').update(normalised).digest('hex');
  }

  private async readCache(key: string): Promise<SearchResponse | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as SearchResponse) : null;
    } catch (err) {
      // A cache that is down must not take search down with it.
      this.logger.warn(`Search cache read failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private async writeCache(key: string, value: SearchResponse): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Search cache write failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
