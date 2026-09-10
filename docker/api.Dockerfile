FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
ENV CI=1

COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

CMD ["pnpm", "--filter", "@promotions/api", "start"]
