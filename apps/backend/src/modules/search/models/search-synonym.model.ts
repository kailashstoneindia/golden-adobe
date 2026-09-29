import { Column, DataType, Default, Model, Table } from 'sequelize-typescript';
import { literal } from 'sequelize';

// Phase 6e (decisions 0019, 0021). Admin-editable search synonyms, merged
// into the Meilisearch index settings at bootstrap by meili.bootstrap.ts.
@Table({
  tableName: 'search_synonym',
  timestamps: true,
  underscored: true,
})
export class SearchSynonym extends Model {
  @Default(literal('gen_random_uuid()'))
  @Column({ type: DataType.UUID, primaryKey: true, allowNull: false })
  declare id: string;

  // The term a customer types, e.g. 'mcb'.
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  declare term: string;

  // What it should also match, e.g. ['miniature circuit breaker', 'breaker'].
  @Default([])
  @Column({ type: DataType.ARRAY(DataType.STRING(64)), allowNull: false })
  declare synonyms: string[];

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
