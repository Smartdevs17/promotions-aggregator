FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @promotions/shared build && pnpm --filter @promotions/web build
EXPOSE 3000
CMD ["pnpm","--filter","@promotions/web","start"]
