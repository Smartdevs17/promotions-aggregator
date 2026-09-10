import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize } from 'sequelize';

export type VerificationStatus = 'pending' | 'verified' | 'changed' | 'missing' | 'failed';

export class PromotionModel extends Model<InferAttributes<PromotionModel>, InferCreationAttributes<PromotionModel>> {
  declare id: CreationOptional<string>;
  declare brandId: string;
  declare sourceKey: string;
  declare name: string;
  declare description: string | null;
  declare imageUrl: string | null;
  declare startDate: string | null;
  declare endDate: string | null;
  declare canonicalUrl: string;
  declare sourcePortal: string;
  declare scrapedAt: Date;
  declare lastVerifiedAt: Date | null;
  declare verificationStatus: VerificationStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initPromotionModel(sequelize: Sequelize): typeof PromotionModel {
  PromotionModel.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    brandId: { type: DataTypes.UUID, allowNull: false, field: 'brand_id' },
    sourceKey: { type: DataTypes.STRING(512), allowNull: false, field: 'source_key' },
    name: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    imageUrl: { type: DataTypes.TEXT, allowNull: true, field: 'image_url' },
    startDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'start_date' },
    endDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'end_date' },
    canonicalUrl: { type: DataTypes.TEXT, allowNull: false, field: 'canonical_url' },
    sourcePortal: { type: DataTypes.TEXT, allowNull: false, field: 'source_portal' },
    scrapedAt: { type: DataTypes.DATE, allowNull: false, field: 'scraped_at' },
    lastVerifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_verified_at' },
    verificationStatus: {
      type: DataTypes.ENUM('pending', 'verified', 'changed', 'missing', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'verification_status',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, {
    sequelize,
    tableName: 'promotions',
    underscored: true,
    indexes: [
      { unique: true, fields: ['source_portal', 'source_key'], name: 'promotions_source_identity_unique' },
      { fields: ['brand_id'] },
      { fields: ['end_date'] },
    ],
  });

  return PromotionModel;
}
