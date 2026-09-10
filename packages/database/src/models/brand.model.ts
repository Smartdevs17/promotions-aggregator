import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize } from 'sequelize';

export class BrandModel extends Model<InferAttributes<BrandModel>, InferCreationAttributes<BrandModel>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare normalizedName: string;
  declare sourceUrl: string | null;
  declare websiteUrl: string | null;
  declare hours: string | null;
  declare socialLinks: Record<string, string>;
  declare scrapedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initBrandModel(sequelize: Sequelize): typeof BrandModel {
  BrandModel.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    normalizedName: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    sourceUrl: { type: DataTypes.TEXT, allowNull: true },
    websiteUrl: { type: DataTypes.TEXT, allowNull: true },
    hours: { type: DataTypes.TEXT, allowNull: true },
    socialLinks: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    scrapedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'brands', underscored: true });

  return BrandModel;
}
