declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_SHELTER_ORIGIN?: string;
  readonly VITE_TRANSIT_ORIGIN?: string;
  readonly VITE_SUPPLY_ORIGIN?: string;
  readonly VITE_RELAY_ORIGIN?: string;
  readonly VITE_ENABLE_PROOF_RUNNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** True only when the current document actually runs in an origin-keyed agent cluster. */
  readonly originAgentCluster: boolean;
}
