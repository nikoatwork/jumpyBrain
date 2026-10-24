/** All paths in entries are portable, root-relative paths; no document bodies. */
export type LogseqMigrationAction = "create" | "overwrite" | "delete" | "unchanged";
export type LogseqBodyFormat = "readable" | "preserve";
export interface LogseqMigrationOptions { apply?: boolean; failOnConflict?: boolean; bodyFormat?: LogseqBodyFormat }

export interface LogseqMigrationDocument {
  sourcePath: string;
  outputPath: string;
  type: "note" | "session";
  title: string;
  date?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceHash: string;
  bodyFormat: LogseqBodyFormat;
  bodyVersion: number;
  bodyHash: string;
  bodyBytes: number;
  outputHash: string;
  sourceBytes: number;
  outputBytes: number;
}

export interface LogseqMigrationEntry extends LogseqMigrationDocument {
  action: LogseqMigrationAction;
  conflict: boolean;
  /** Observed preflight state, separate from the proposed outputHash. */
  destinationHash?: string;
  previousSourceHash?: string;
  previousOutputHash?: string;
}

export interface LogseqMigrationManifest {
  version: 1 | 2;
  importer: "jumpybrain-logseq";
  importerVersion: 1 | 2;
  migratedAt: string;
  entries: LogseqMigrationDocument[];
  counts: { created: number; overwritten: number; deleted: number; unchanged: number; warnings: number };
}

export interface LogseqMigrationResult {
  dryRun: boolean;
  applied: boolean;
  root: string;
  sourceDocuments: number;
  outputDocuments: number;
  pages: number;
  journals: number;
  created: number;
  overwritten: number;
  deleted: number;
  unchanged: number;
  sourceBytes: number;
  outputBytes: number;
  conversion: {
    bodyFormat: LogseqBodyFormat;
    bodyVersion: number;
    changedDocuments: number;
    preservedDocuments: number;
    unsupportedDocuments: number;
    removedOutlineMarkers: number;
    retainedNestedBlocks: number;
  };
  warnings: string[];
  errors: string[];
  entries: LogseqMigrationEntry[];
  manifest: string;
  indexed: false;
}
