/// <reference path="../worker-configuration.d.ts" />
import type * as CF from '@cloudflare/workers-types';

declare global {
  type D1Database = CF.D1Database;
  type R2Bucket = CF.R2Bucket;
  type Fetcher = CF.Fetcher;
  type WorkerVersionMetadata = CF.WorkerVersionMetadata;
}
