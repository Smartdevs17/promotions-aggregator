FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @promotions/shared build && pnpm --filter @promotions/web build
EXPOSE 3000
CMD ["pnpm","--filter","@promotions/web","start"]
