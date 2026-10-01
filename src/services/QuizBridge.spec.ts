// QuizBridgeModule spec — hợp đồng native (P4). Copy ý tưởng này khi viết
// ReactContextBaseJavaModule thật sau prebuild.
export const QUIZ_BRIDGE_METHODS = [
  'startAssistant',
  'stopAssistant',
  'scanOnce',      // (quizSetId: 'cathay'|'yamato') -> {ocrText, normalized, matched, correctIndex}
  'testOcr',       // () -> {rawText, ocrText, normalized, matched, correctIndex}
  'getConfig',     // () -> QuizOcrConfig
  'setConfig',     // (QuizOcrConfig) -> void
  'getSelectedSet',
  'setSelectedSet',
] as const;
