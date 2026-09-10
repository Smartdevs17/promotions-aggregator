import { Sequelize } from 'sequelize';

export type DatabaseConfig = {
  url: string;
  logging?: boolean;
};

export function createSequelize(config: DatabaseConfig): Sequelize {
  return new Sequelize(config.url, {
    dialect: 'postgres',
    logging: config.logging ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
  });
}
