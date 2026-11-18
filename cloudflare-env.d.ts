declare namespace Cloudflare {
  interface Env {
    JUPITER_API_KEY?: string;
    HELIUS_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
