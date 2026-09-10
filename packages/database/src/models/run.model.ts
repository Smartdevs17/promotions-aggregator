import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type Sequelize } from 'sequelize';

export type RunState = 'queued' | 'active' | 'completed' | 'failed' | 'suspicious';
export type SourceHealth = 'unknown' | 'healthy' | 'suspicious' | 'unreachable';

export class ScrapeRunModel extends Model<InferAttributes<ScrapeRunModel>, InferCreationAttributes<ScrapeRunModel>> {
  declare id: CreationOptional<string>;
  declare jobId: string;
  declare state: RunState;
  declare attempted: CreationOptional<number>;
  declare persisted: CreationOptional<number>;
  declare updated: CreationOptional<number>;
  declare skipped: CreationOptional<number>;
  declare failed: CreationOptional<number>;
  declare sourceHealth: SourceHealth;
  declare errorSummary: string | null;
  declare startedAt: Date | null;
  declare finishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class VerificationRunModel extends Model<InferAttributes<VerificationRunModel>, InferCreationAttributes<VerificationRunModel>> {
  declare id: CreationOptional<string>;
  declare jobId: string;
  declare state: RunState;
  declare checked: CreationOptional<number>;
  declare discrepancyCount: CreationOptional<number>;
  declare clean: CreationOptional<boolean>;
  declare errorSummary: string | null;
  declare startedAt: Date | null;
  declare finishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initRunModels(sequelize: Sequelize): void {
  ScrapeRunModel.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'job_id' },
    state: { type: DataTypes.ENUM('queued', 'active', 'completed', 'failed', 'suspicious'), allowNull: false, defaultValue: 'queued' },
    attempted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    persisted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sourceHealth: { type: DataTypes.ENUM('unknown', 'healthy', 'suspicious', 'unreachable'), allowNull: false, defaultValue: 'unknown', field: 'source_health' },
    errorSummary: { type: DataTypes.TEXT, allowNull: true, field: 'error_summary' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'scrape_runs', underscored: true });

  VerificationRunModel.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'job_id' },
    state: { type: DataTypes.ENUM('queued', 'active', 'completed', 'failed', 'suspicious'), allowNull: false, defaultValue: 'queued' },
    checked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    discrepancyCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'discrepancy_count' },
    clean: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    errorSummary: { type: DataTypes.TEXT, allowNull: true, field: 'error_summary' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'verification_runs', underscored: true });
}
