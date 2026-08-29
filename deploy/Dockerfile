FROM node:22-alpine AS build

WORKDIR /workspace

ARG VITE_RELAY_ORIGIN
ARG VITE_SHELTER_ORIGIN
ARG VITE_TRANSIT_ORIGIN
ARG VITE_SUPPLY_ORIGIN
ARG VITE_ENABLE_PROOF_RUNNER=0

ENV VITE_RELAY_ORIGIN=$VITE_RELAY_ORIGIN \
    VITE_SHELTER_ORIGIN=$VITE_SHELTER_ORIGIN \
    VITE_TRANSIT_ORIGIN=$VITE_TRANSIT_ORIGIN \
    VITE_SUPPLY_ORIGIN=$VITE_SUPPLY_ORIGIN \
    VITE_ENABLE_PROOF_RUNNER=$VITE_ENABLE_PROOF_RUNNER

COPY package.json .npmrc .nvmrc tsconfig.json tsconfig.check.json globals.d.ts ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm install --no-audit --no-fund
RUN npm run verify

FROM nginx:alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/entrypoint.sh /usr/local/bin/relay-entrypoint
COPY --from=build /workspace/apps /opt/relay/apps

ENV RELAY_APP=relay-command

RUN chmod 0555 /usr/local/bin/relay-entrypoint \
    && find /opt/relay -type d -exec chmod 0555 {} \; \
    && find /opt/relay -type f -exec chmod 0444 {} \;

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/relay-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
