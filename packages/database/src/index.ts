import type { Sequelize } from 'sequelize';
import { createSequelize, type DatabaseConfig } from './sequelize.js';
import { BrandModel, initBrandModel } from './models/brand.model.js';
import { PromotionModel, initPromotionModel } from './models/promotion.model.js';
import { ScrapeRunModel, VerificationRunModel, initRunModels } from './models/run.model.js';
import { VerificationDiscrepancyModel, initVerificationDiscrepancyModel } from './models/verification-discrepancy.model.js';

export function initModels(sequelize: Sequelize): void {
  initBrandModel(sequelize);
  initPromotionModel(sequelize);
  initRunModels(sequelize);
  initVerificationDiscrepancyModel(sequelize);

  BrandModel.hasMany(PromotionModel, { foreignKey: 'brandId', as: 'promotions', onDelete: 'RESTRICT' });
  PromotionModel.belongsTo(BrandModel, { foreignKey: 'brandId', as: 'brand' });

  VerificationRunModel.hasMany(VerificationDiscrepancyModel, {
    foreignKey: 'verificationRunId',
    as: 'discrepancies',
    onDelete: 'CASCADE',
  });
  VerificationDiscrepancyModel.belongsTo(VerificationRunModel, {
    foreignKey: 'verificationRunId',
    as: 'run',
  });
  PromotionModel.hasMany(VerificationDiscrepancyModel, {
    foreignKey: 'promotionId',
    as: 'verificationDiscrepancies',
    onDelete: 'CASCADE',
  });
  VerificationDiscrepancyModel.belongsTo(PromotionModel, {
    foreignKey: 'promotionId',
    as: 'promotion',
  });
}

export function createDatabase(config: DatabaseConfig): Sequelize {
  const sequelize = createSequelize(config);
  initModels(sequelize);
  return sequelize;
}

export {
  BrandModel,
  PromotionModel,
  ScrapeRunModel,
  VerificationRunModel,
  VerificationDiscrepancyModel,
};
export type { DatabaseConfig } from './sequelize.js';
