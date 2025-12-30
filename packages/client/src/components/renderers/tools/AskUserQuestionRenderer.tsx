import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
  Question,
  ToolRenderer,
} from "./types";

/**
 * Single question display
 */
function QuestionDisplay({
  question,
  selectedAnswer,
}: {
  question: Question;
  selectedAnswer?: string;
}) {
  return (
    <div className="question-item">
      <div className="question-header">
        <span className="badge">{question.header}</span>
        <span className="question-text">{question.question}</span>
      </div>
      <ul className="question-options">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option.label;
          return (
            <li
              key={option.label}
              className={`question-option ${isSelected ? "question-option-selected" : ""}`}
            >
              <span className="question-option-indicator">
                {question.multiSelect
                  ? isSelected
                    ? "☑"
                    : "☐"
                  : isSelected
                    ? "●"
                    : "○"}
              </span>
              <div className="question-option-content">
                <span className="question-option-label">{option.label}</span>
                {option.description && (
                  <span className="question-option-desc">
                    {option.description}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * AskUserQuestion tool use - shows questions to be asked
 */
function AskUserQuestionToolUse({ input }: { input: AskUserQuestionInput }) {
  return (
    <div className="question-tool-use">
      {input.questions.map((q, i) => (
        <QuestionDisplay key={`${q.header}-${i}`} question={q} />
      ))}
    </div>
  );
}

/**
 * AskUserQuestion tool result - shows questions with selected answers
 */
function AskUserQuestionToolResult({
  result,
  isError,
}: {
  result: AskUserQuestionResult;
  isError: boolean;
}) {
  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="question-error">
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Question failed"}
      </div>
    );
  }

  if (!result || !result.questions) {
    return <div className="question-empty">No questions</div>;
  }

  return (
    <div className="question-result">
      {result.questions.map((q, i) => {
        // Find the answer by matching the question text
        const answer = result.answers?.[q.question];
        return (
          <QuestionDisplay
            key={`${q.header}-${i}`}
            question={q}
            selectedAnswer={answer}
          />
        );
      })}
    </div>
  );
}

export const askUserQuestionRenderer: ToolRenderer<
  AskUserQuestionInput,
  AskUserQuestionResult
> = {
  tool: "AskUserQuestion",

  renderToolUse(input, _context) {
    return <AskUserQuestionToolUse input={input as AskUserQuestionInput} />;
  },

  renderToolResult(result, isError, _context) {
    return (
      <AskUserQuestionToolResult
        result={result as AskUserQuestionResult}
        isError={isError}
      />
    );
  },

  getUseSummary(input) {
    const questions = (input as AskUserQuestionInput).questions;
    return `${questions?.length || 0} question${questions?.length === 1 ? "" : "s"}`;
  },

  getResultSummary(result, isError, input) {
    if (isError) return "Error";
    const r = result as AskUserQuestionResult;
    const i = input as AskUserQuestionInput;
    const answered = Object.keys(r?.answers || {}).length;
    // If no answers yet but we have questions, show question count instead
    if (answered === 0 && i?.questions?.length) {
      return `${i.questions.length} question${i.questions.length === 1 ? "" : "s"}`;
    }
    return `${answered} answered`;
  },
};
