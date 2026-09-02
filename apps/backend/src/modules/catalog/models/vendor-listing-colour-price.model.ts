import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { VendorListing } from './vendor-listing.model';

export enum PaintColourFamily {
  WHITE = 'white',
  OFF_WHITE = 'off_white',
  BEIGE = 'beige',
  BROWN = 'brown',
  YELLOW = 'yellow',
  ORANGE = 'orange',
  RED = 'red',
  PINK = 'pink',
  PURPLE = 'purple',
  BLUE = 'blue',
  GREEN = 'green',
  GREY = 'grey',
  BLACK = 'black',
}

// Absolute price per listing per colour (decisions 0007, 0016) — no delta,
// no per-litre scaling. A colour family with no row here is not offered by
// that vendor.
@Table({
  tableName: 'vendor_listing_colour_price',
  timestamps: true,
  underscored: true,
})
export class VendorListingColourPrice extends Model<VendorListingColourPrice> {
  @ForeignKey(() => VendorListing)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'vendor_listing_id',
  })
  declare vendorListingId: string;

  @Column({
    type: DataType.ENUM(...Object.values(PaintColourFamily)),
    allowNull: false,
    primaryKey: true,
    field: 'colour_family',
  })
  declare colourFamily: PaintColourFamily;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
  })
  declare price: number;

  @BelongsTo(() => VendorListing)
  declare vendorListing?: VendorListing;
}
