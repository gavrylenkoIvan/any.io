import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import UpdateCompanyDto from 'src/companies/dtos/update-company.dto';
import { CompaniesService } from 'src/companies/services/companies/companies.service';
import { I18nTranslations } from 'src/generated/i18n.generated';
import CreateProductDto from 'src/products/dtos/create-product.dto';
import FindAllQueryDto from 'src/products/dtos/find-all-query.dto';
import Product from 'src/products/entities/product.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly companiesService: CompaniesService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async findAll({
    orderBy = 'id',
    orderByType = 'desc',
    limit = 10,
    page = 0,
    minPrice = 0,
    maxPrice = 99999999999999,
  }: FindAllQueryDto): Promise<Product[]> {
    return this.productsRepo
      .createQueryBuilder('product')
      .where('product.price BETWEEN :minPrice AND :maxPrice', {
        minPrice: minPrice,
        maxPrice: maxPrice,
      })
      .addOrderBy(
        `product.${orderBy}`,
        orderByType.toUpperCase() as 'ASC' | 'DESC',
      )
      .leftJoinAndSelect('product.reviews', 'review')
      .leftJoinAndSelect('product.category', 'category')
      .limit(limit)
      .offset(page * limit)
      .getMany();
  }

  async findById(productId: number): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: {
        id: productId,
      },
      relations: {
        company: true,
      },
    });

    if (!product) {
      throw new BadRequestException(
        this.i18n.t('messages.no_rows_updated', I18nContext.current()),
      );
    }

    return product;
  }

  async create(userId: number, createDto: CreateProductDto): Promise<number> {
    const company = await this.companiesService.findByUserId(userId);
    if (!company) {
      throw new BadRequestException(
        this.i18n.t('messages.user_company_is_null', I18nContext.current()),
      );
    }

    const res = await this.productsRepo.insert({
      ...createDto,
      company: {
        id: company.id,
      },
    });

    return res.identifiers[0].id as number;
  }

  async update(
    userId: number,
    productId: number,
    updateDto: UpdateCompanyDto,
  ): Promise<void> {
    const product = await this.findById(productId);
    if (!product) {
      throw new BadRequestException(
        this.i18n.t('messages.no_rows_updated', I18nContext.current()),
      );
    }

    const company = await this.companiesService.findById(product.company.id);

    if (!company || company.user.id !== userId) {
      throw new UnauthorizedException(
        this.i18n.t(
          'messages.user_does_not_own_company',
          I18nContext.current(),
        ),
      );
    }

    const res = await this.productsRepo.update(
      {
        id: productId,
      },
      updateDto,
    );

    if (res.affected === 0) {
      throw new InternalServerErrorException(
        this.i18n.t('messages.no_rows_updated', I18nContext.current()),
      );
    }
  }
}
