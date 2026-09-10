import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.createTable('brands', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    normalized_name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    source_url: { type: DataTypes.TEXT, allowNull: true },
    website_url: { type: DataTypes.TEXT, allowNull: true },
    hours: { type: DataTypes.TEXT, allowNull: true },
    social_links: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    scraped_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.createTable('promotions', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'brands', key: 'id' }, onDelete: 'RESTRICT' },
    source_key: { type: DataTypes.STRING(512), allowNull: false },
    name: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    image_url: { type: DataTypes.TEXT, allowNull: true },
    start_date: { type: DataTypes.DATEONLY, allowNull: true },
    end_date: { type: DataTypes.DATEONLY, allowNull: true },
    canonical_url: { type: DataTypes.TEXT, allowNull: false },
    source_portal: { type: DataTypes.TEXT, allowNull: false },
    scraped_at: { type: DataTypes.DATE, allowNull: false },
    last_verified_at: { type: DataTypes.DATE, allowNull: true },
    verification_status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('promotions', ['source_portal', 'source_key'], { unique: true, name: 'promotions_source_identity_unique' });
  await queryInterface.addIndex('promotions', ['brand_id']);
  await queryInterface.addIndex('promotions', ['end_date']);
  await queryInterface.sequelize.query('ALTER TABLE promotions ADD CONSTRAINT promotions_valid_date_range CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)');

  await queryInterface.createTable('scrape_runs', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    job_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    state: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'queued' },
    attempted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    persisted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    source_health: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown' },
    error_summary: { type: DataTypes.TEXT, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  for (const field of ['attempted', 'persisted', 'updated', 'skipped', 'failed']) {
    await queryInterface.sequelize.query(`ALTER TABLE scrape_runs ADD CONSTRAINT scrape_runs_${field}_nonnegative CHECK (${field} >= 0)`);
  }

  await queryInterface.createTable('verification_runs', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    job_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    state: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'queued' },
    checked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    discrepancy_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    clean: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    error_summary: { type: DataTypes.TEXT, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.sequelize.query('ALTER TABLE verification_runs ADD CONSTRAINT verification_runs_checked_nonnegative CHECK (checked >= 0)');
  await queryInterface.sequelize.query('ALTER TABLE verification_runs ADD CONSTRAINT verification_runs_discrepancy_count_nonnegative CHECK (discrepancy_count >= 0)');

  await queryInterface.createTable('verification_discrepancies', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    verification_run_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'verification_runs', key: 'id' }, onDelete: 'CASCADE' },
    promotion_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'promotions', key: 'id' }, onDelete: 'CASCADE' },
    kind: { type: DataTypes.STRING(32), allowNull: false },
    field: { type: DataTypes.STRING(255), allowNull: true },
    before: { type: DataTypes.TEXT, allowNull: true },
    after: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('verification_discrepancies', ['verification_run_id']);
  await queryInterface.addIndex('verification_discrepancies', ['promotion_id']);
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.dropTable('verification_discrepancies');
  await queryInterface.dropTable('verification_runs');
  await queryInterface.dropTable('scrape_runs');
  await queryInterface.dropTable('promotions');
  await queryInterface.dropTable('brands');
}
