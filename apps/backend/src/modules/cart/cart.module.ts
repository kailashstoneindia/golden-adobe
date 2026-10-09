import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Cart } from './models/cart.model';
import { CartItem } from './models/cart-item.model';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CustomersModule } from '../customers/customers.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [SequelizeModule.forFeature([Cart, CartItem]), CustomersModule, CatalogModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
