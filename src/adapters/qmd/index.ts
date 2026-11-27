export { buildQmdIndex, loadManifest, prewarmQmdSmartSearch, searchQmdIndex, type QmdManifest } from "./qmd-driver.js";
export { retainWarmSmartSearch } from "./qmd-warm.js";
export { queryKeywordCount } from "./qmd-query.js";
export { ReadOnlyQmdError } from "./qmd-read-only.js";
export { qmdReadiness, recoverQmdIndex } from "./qmd-lifecycle.js";
export { withQmdOperation, readExecution, executionSignal, checkExecution, executionScope, executionTimeout, EXECUTION_LIMITS, MemoryExecutionError } from "./qmd-execution.js";

export { inspectLocalSearchEngine } from "./qmd-cli.js";

export { withQmdBinary } from "./qmd-cli.js";

export { resolveQmdBinary as resolveLocalSearchEngineBinary } from "./qmd-cli.js";

export { provisionLocalModel, localModelAvailable, localModelFile, removeLocalModel, SEMANTIC_MODEL } from "./model-setup.js";
export { readQmdSemanticLinks } from "./qmd-graph.js";
