import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type Sequelize } from 'sequelize';

export type DiscrepancyKind = 'missing' | 'changed' | 'unverifiable';

export class VerificationDiscrepancyModel extends Model<InferAttributes<VerificationDiscrepancyModel>, InferCreationAttributes<VerificationDiscrepancyModel>> {
  declare id: CreationOptional<string>;
  declare verificationRunId: string;
  declare promotionId: string;
  declare kind: DiscrepancyKind;
  declare field: string | null;
  declare before: string | null;
  declare after: string | null;
  declare reason: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initVerificationDiscrepancyModel(sequelize: Sequelize): typeof VerificationDiscrepancyModel {
  VerificationDiscrepancyModel.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    verificationRunId: { type: DataTypes.UUID, allowNull: false, field: 'verification_run_id' },
    promotionId: { type: DataTypes.UUID, allowNull: false, field: 'promotion_id' },
    kind: { type: DataTypes.ENUM('missing', 'changed', 'unverifiable'), allowNull: false },
    field: { type: DataTypes.STRING(255), allowNull: true },
    before: { type: DataTypes.TEXT, allowNull: true },
    after: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, {
    sequelize,
    tableName: 'verification_discrepancies',
    underscored: true,
    indexes: [{ fields: ['verification_run_id'] }, { fields: ['promotion_id'] }],
  });

  return VerificationDiscrepancyModel;
}
