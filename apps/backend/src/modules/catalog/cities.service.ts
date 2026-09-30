import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { CityDto } from '@golden-abode/types';

import { City } from './models/city.model';

@Injectable()
export class CitiesService {
  private readonly logger = new Logger(CitiesService.name);

  constructor(
    @InjectModel(City)
    private readonly cityModel: typeof City,
  ) {}

  async listActiveCities(): Promise<CityDto[]> {
    this.logger.log('Listing active cities for admin picker');
    const cities = await this.cityModel.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'state', 'slug'],
      order: [
        ['state', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return cities.map((city) => this.toCityDto(city));
  }

  private toCityDto(city: City): CityDto {
    return {
      id: city.id,
      name: city.name,
      state: city.state,
      slug: city.slug,
    };
  }
}
