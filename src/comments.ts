import * as BabelCore from '@babel/core';
import * as BabelTypes from '@babel/types';

type CommentHintType = 'DISABLE' | 'NAMESPACE' | 'CONTEXT' | 'PLURAL';
type CommentHintScope =
  | 'LINE'
  | 'NEXT_LINE'
  | 'SECTION_START'
  | 'SECTION_STOP';

/**
 * Comment Hint without line location information.
 */
interface BaseCommentHint {
  type: CommentHintType;
  scope: CommentHintScope;
  value: string;
  comment: BabelTypes.Comment;
}

/**
 * Line intervals
 */
interface Interval {
  startLine: number;
  stopLine: number;
}

/**
 * Comment Hint with line intervals information.
 */
export interface CommentHint extends BaseCommentHint, Interval {}

export const COMMENT_HINT_PREFIX = 'i18next-extract-';
export const COMMENT_HINTS_KEYWORDS: {
  [k in CommentHintType]: { [s in CommentHintScope]: string };
} = {
  DISABLE: {
    LINE: COMMENT_HINT_PREFIX + 'disable-line',
    NEXT_LINE: COMMENT_HINT_PREFIX + 'disable-next-line',
    SECTION_START: COMMENT_HINT_PREFIX + 'disable',
    SECTION_STOP: COMMENT_HINT_PREFIX + 'enable'
  },
  NAMESPACE: {
    LINE: COMMENT_HINT_PREFIX + 'mark-ns-line',
    NEXT_LINE: COMMENT_HINT_PREFIX + 'mark-ns-next-line',
    SECTION_START: COMMENT_HINT_PREFIX + 'mark-ns-start',
    SECTION_STOP: COMMENT_HINT_PREFIX + 'mark-ns-stop'
  },
  CONTEXT: {
    LINE: COMMENT_HINT_PREFIX + 'mark-context-line',
    NEXT_LINE: COMMENT_HINT_PREFIX + 'mark-context-next-line',
    SECTION_START: COMMENT_HINT_PREFIX + 'mark-context-start',
    SECTION_STOP: COMMENT_HINT_PREFIX + 'mark-context-stop'
  },
  PLURAL: {
    LINE: COMMENT_HINT_PREFIX + 'mark-plural-line',
    NEXT_LINE: COMMENT_HINT_PREFIX + 'mark-plural-next-line',
    SECTION_START: COMMENT_HINT_PREFIX + 'mark-plural-start',
    SECTION_STOP: COMMENT_HINT_PREFIX + 'mark-plural-stop'
  }
};

/**
 * Given a Babel Comment, extract BaseCommentHints.
 * @param comment babel comment
 * @yields Comment hint without line interval information.
 */
function* extractCommentHintsFromBabelComment(
  comment: BabelTypes.Comment
): IterableIterator<BaseCommentHint> {
  for (const line of comment.value.split(/\r?\n/)) {
    const trimmedValue = line.trim();
    const keyword = trimmedValue.split(/\s+/)[0];
    const value = trimmedValue.split(/\s+(.+)/)[1] || '';

    for (const [commentHintType, commentHintKeywords] of Object.entries(
      COMMENT_HINTS_KEYWORDS
    )) {
      for (const [commentHintScope, commentHintKeyword] of Object.entries(
        commentHintKeywords
      )) {
        if (keyword === commentHintKeyword) {
          yield {
            type: commentHintType as CommentHintType,
            scope: commentHintScope as CommentHintScope,
            value,
            comment
          };
        }
      }
    }
  }
}

/**
 * Given an array of comment hints, compute their intervals.
 * @param commentHints comment hints without line intervals information.
 * @returns Comment hints with line interval information.
 */
function computeCommentHintsIntervals(
  commentHints: BaseCommentHint[]
): CommentHint[] {
  const result = Array<CommentHint>();

  for (const commentHint of commentHints) {
    if (commentHint.scope === 'LINE') {
      result.push({
        startLine: commentHint.comment.loc.start.line,
        stopLine: commentHint.comment.loc.start.line,
        ...commentHint
      });
    }

    if (commentHint.scope === 'NEXT_LINE') {
      result.push({
        startLine: commentHint.comment.loc.end.line + 1,
        stopLine: commentHint.comment.loc.end.line + 1,
        ...commentHint
      });
    }

    if (commentHint.scope === 'SECTION_START') {
      result.push({
        startLine: commentHint.comment.loc.start.line,
        stopLine: Infinity,
        ...commentHint
      });
    }

    if (commentHint.scope === 'SECTION_STOP') {
      for (const res of result) {
        if (
          res.type === commentHint.type &&
          res.scope === 'SECTION_START' &&
          res.stopLine === Infinity
        ) {
          res.stopLine = commentHint.comment.loc.start.line;
        }
      }
    }
  }

  return result;
}

/**
 * Given Babel comments, extract the comment hints.
 * @param comments Babel comments (ordered by line)
 */
export function parseCommentHints(
  comments: BabelTypes.Comment[]
): CommentHint[] {
  const baseCommentHints = Array<BaseCommentHint>();

  for (const comment of comments) {
    baseCommentHints.push(...extractCommentHintsFromBabelComment(comment));
  }

  return computeCommentHintsIntervals(baseCommentHints);
}

/**
 * Find comment hint of a given type that applies to a Babel node path.
 * @param path babel node path
 * @param commentHintType Type of comment hint to look for.
 * @param commentHints All the comment hints, as returned by parseCommentHints function.
 */
export function getCommentHintForPath(
  path: BabelCore.NodePath,
  commentHintType: BaseCommentHint['type'],
  commentHints: CommentHint[]
): CommentHint | null {
  if (!path.node.loc) return null;
  const nodeLine = path.node.loc.start.line;

  for (const commentHint of commentHints) {
    if (
      commentHint.type === commentHintType &&
      commentHint.startLine <= nodeLine &&
      nodeLine <= commentHint.stopLine
    ) {
      return commentHint;
    }
  }

  return null;
}
