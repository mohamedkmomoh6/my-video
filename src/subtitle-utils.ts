export type WhisperWord = {
	word: string;
	start: number;
	end: number;
};

export type SubtitleChunk = {
	text: string;
	start: number;
	end: number;
	isPowerWord?: boolean;
	words?: WhisperWord[];
};

const SILENCE_TRIM_THRESHOLD_SECONDS = 0.1;
const DEFAULT_CHUNK_WINDOW_SECONDS = 1.3;
const MAX_WORDS_PER_CHUNK = 5;
const MAX_WORDS_PER_DISPLAY_CHUNK = 4;
const MAX_CHARS_PER_DISPLAY_CHUNK = 28;
const SENTENCE_END_REGEX = /[.!?]["')\]]*$/;

const KEYWORD_EMOJI_MAP: Record<string, string> = {
};

export const powerWordsDatabase: Record<'de' | 'en' | 'it', string[]> = {
	de: ['geld', 'erfolg', 'ki', 'stopp', 'chance', 'macht', 'ziel', 'freiheit', 'wachstum', 'durchbruch'],
	en: ['money', 'success', 'ai', 'stop', 'focus', 'power', 'win', 'growth', 'breakthrough', 'freedom'],
	it: ['soldi', 'secondi', 'successo', 'ia', 'stop', 'potere', 'crescita', 'vittoria', 'obiettivo', 'libertà', 'svolta'],
};

const POWER_WORDS_SET = new Set(
	Object.values(powerWordsDatabase)
		.flat()
		.map((word) => word.toLowerCase())
);

const normalizeToken = (token: string): string => {
	return token
		.toLowerCase()
		.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, '')
		.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/, '');
};

const normalizeWordWhitespace = (value: string): string => {
	// Normalisiert problematische Unicode-Leerzeichen (z.B. NBSP) auf reguläres Space,
	// damit Abstände stabil bleiben und konsistent gerendert werden.
	return value.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
};

export const isBlockPowerWord = (text: string): boolean => {
	const tokens = text.split(/\s+/).map(normalizeToken).filter(Boolean);
	return tokens.some((token) => POWER_WORDS_SET.has(token));
};

export const addEmojis = (text: string): string => {
	return text
		.split(/(\s+)/)
		.map((token) => {
			if (/^\s+$/.test(token) || token.length === 0) {
				return token;
			}

			const parts = token.match(
				/^([^A-Za-zÀ-ÖØ-öø-ÿ0-9]*)([A-Za-zÀ-ÖØ-öø-ÿ0-9]+)([^A-Za-zÀ-ÖØ-öø-ÿ0-9]*)$/
			);

			if (!parts) {
				return token;
			}

			const [, prefix, coreWord, suffix] = parts;
			const emoji = KEYWORD_EMOJI_MAP[coreWord.toLowerCase()];

			if (!emoji) {
				return token;
			}

			return `${prefix}${coreWord}${emoji}${suffix}`;
		})
		.join('');
};

export const trimSilence = (
	words: WhisperWord[],
	maxGapSeconds = SILENCE_TRIM_THRESHOLD_SECONDS
): WhisperWord[] => {
	if (words.length === 0) {
		return [];
	}

	const sortedWords = [...words].sort((a, b) => a.start - b.start);
	const trimmedWords: WhisperWord[] = [];

	for (const currentWord of sortedWords) {
		const previousWord = trimmedWords[trimmedWords.length - 1];

		if (!previousWord) {
			trimmedWords.push({...currentWord});
			continue;
		}

		const gap = currentWord.start - previousWord.end;
		const shouldTrimGap = gap > maxGapSeconds;
		const adjustedStart = shouldTrimGap ? previousWord.end : currentWord.start;
		const safeEnd = Math.max(currentWord.end, adjustedStart + 0.001);

		trimmedWords.push({
			...currentWord,
			start: adjustedStart,
			end: safeEnd,
		});
	}

	return trimmedWords;
};

const tightenChunkBoundaries = (chunks: SubtitleChunk[]): SubtitleChunk[] => {
	if (chunks.length <= 1) {
		return chunks;
	}

	const tightened = chunks.map((chunk) => ({...chunk}));

	for (let i = 0; i < tightened.length - 1; i++) {
		const current = tightened[i];
		const next = tightened[i + 1];

		if (next.start > current.end) {
			next.start = current.end;
		}
	}

	return tightened;
};

const splitChunkForDisplay = (chunk: SubtitleChunk): SubtitleChunk[] => {
	const rawTokens = chunk.text
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);

	if (rawTokens.length <= 1) {
		return [chunk];
	}

	const chunkDuration = Math.max(0.001, chunk.end - chunk.start);
	const tokenWeights = rawTokens.map((token) => Math.max(1, normalizeToken(token).length || token.length));
	const totalWeight = tokenWeights.reduce((sum, weight) => sum + weight, 0) || 1;

	type Segment = {
		tokens: string[];
		words: WhisperWord[];
		startWeight: number;
		endWeight: number;
	};

	const segments: Segment[] = [];
	let currentTokens: string[] = [];
	let currentWords: WhisperWord[] = [];
	let currentStartWeight = 0;
	let consumedWeight = 0;

	const pushCurrentSegment = () => {
		if (currentTokens.length === 0) {
			return;
		}

		segments.push({
			tokens: [...currentTokens],
			words: [...currentWords],
			startWeight: currentStartWeight,
			endWeight: consumedWeight,
		});
		currentTokens = [];
		currentWords = [];
		currentStartWeight = consumedWeight;
	};

	for (let i = 0; i < rawTokens.length; i++) {
		const token = rawTokens[i];
		const weight = tokenWeights[i];
		const wordObj = chunk.words ? chunk.words[i] : null;
		const candidateTokens = [...currentTokens, token];
		const candidateText = candidateTokens.join(' ');
		const exceedsWordLimit = candidateTokens.length > MAX_WORDS_PER_DISPLAY_CHUNK;
		const exceedsCharLimit = candidateText.length > MAX_CHARS_PER_DISPLAY_CHUNK;

		if (currentTokens.length > 0 && (exceedsWordLimit || exceedsCharLimit)) {
			pushCurrentSegment();
		}

		currentTokens.push(token);
		if (wordObj) {
			currentWords.push(wordObj);
		}
		consumedWeight += weight;
	}

	pushCurrentSegment();

	if (segments.length <= 1) {
		return [chunk];
	}

	return segments.map((segment, index) => {
		const isLast = index === segments.length - 1;
		const start = chunk.start + (segment.startWeight / totalWeight) * chunkDuration;
		const computedEnd = chunk.start + (segment.endWeight / totalWeight) * chunkDuration;
		const end = isLast ? chunk.end : Math.max(start + 0.001, Math.min(chunk.end, computedEnd));

		return {
			text: segment.tokens.join(' '),
			start,
			end,
			words: segment.words,
		};
	});
};

export const groupWhisperWordsToChunks = (
	words: WhisperWord[],
	gapThreshold = SILENCE_TRIM_THRESHOLD_SECONDS,
	chunkWindowSeconds = DEFAULT_CHUNK_WINDOW_SECONDS
): SubtitleChunk[] => {
	const effectiveGapThreshold = Math.max(0, gapThreshold);
	const safeChunkWindowSeconds = Math.max(0.25, chunkWindowSeconds);
	const optimizedWords = trimSilence(words, effectiveGapThreshold);

	if (optimizedWords.length === 0) {
		return [];
	}

	const sortedWords = [...optimizedWords].sort((a, b) => a.start - b.start);
	const chunks: SubtitleChunk[] = [];
	let currentChunk: SubtitleChunk | null = null;
	let currentWordCount = 0;

	const finalizeCurrentChunk = () => {
		if (!currentChunk) {
			return;
		}

		chunks.push({...currentChunk});
		currentChunk = null;
		currentWordCount = 0;
	};

	for (const wordItem of sortedWords) {
		const rawWord = normalizeWordWhitespace(wordItem.word);
		const cleanedWord = rawWord.trim();

		if (!cleanedWord && !rawWord) {
			continue;
		}

		// Merge punctuation-only tokens to preceding word
		const isPunctuationOnly = /^[.!?,;:\-—–]+$/.test(cleanedWord);
		if (isPunctuationOnly && currentChunk && currentChunk.words && currentChunk.words.length > 0) {
			currentChunk.text = `${currentChunk.text}${cleanedWord}`;
			const lastWordIndex = currentChunk.words.length - 1;
			currentChunk.words[lastWordIndex] = {
				...currentChunk.words[lastWordIndex],
				word: `${currentChunk.words[lastWordIndex].word}${cleanedWord}`,
				end: Math.max(currentChunk.words[lastWordIndex].end, wordItem.end)
			};
			currentChunk.end = Math.max(currentChunk.end, wordItem.end);
			continue;
		}

		if (!currentChunk) {
			currentChunk = {
				text: cleanedWord,
				start: wordItem.start,
				end: wordItem.end,
				words: [{ ...wordItem, word: cleanedWord }],
			};
			currentWordCount = 1;

			if (SENTENCE_END_REGEX.test(cleanedWord)) {
				finalizeCurrentChunk();
			}

			continue;
		}

		const exceededTimeWindow = wordItem.start - currentChunk.start >= safeChunkWindowSeconds;
		const exceededWordLimit = currentWordCount >= MAX_WORDS_PER_CHUNK;

		if (exceededTimeWindow || exceededWordLimit) {
			finalizeCurrentChunk();
			currentChunk = {
				text: cleanedWord,
				start: wordItem.start,
				end: wordItem.end,
				words: [{ ...wordItem, word: cleanedWord }],
			};
			currentWordCount = 1;
		} else {
			currentChunk.text = `${currentChunk.text} ${cleanedWord}`.trim();
			currentChunk.end = Math.max(currentChunk.end, wordItem.end);
			if (!currentChunk.words) {
				currentChunk.words = [];
			}
			currentChunk.words.push({ ...wordItem, word: cleanedWord });
			currentWordCount += 1;
		}

		if (SENTENCE_END_REGEX.test(cleanedWord)) {
			finalizeCurrentChunk();
		}
	}

	finalizeCurrentChunk();

	const displayOptimizedChunks = chunks.flatMap(splitChunkForDisplay);
	const gaplessChunks = tightenChunkBoundaries(displayOptimizedChunks);

	const result = gaplessChunks.map((chunk) => ({
		...chunk,
		text: addEmojis(chunk.text),
		isPowerWord: isBlockPowerWord(chunk.text),
	}));

	// Debug: Prüfe auf Duplikate oder Überschneidungen
	if (process.env.NODE_ENV === 'development') {
		const seenTexts = new Set<string>();
		for (const chunk of result) {
			if (seenTexts.has(chunk.text)) {
				console.warn(`⚠️  Duplizierter Text: "${chunk.text}" bei ${chunk.start}s`);
			}
			seenTexts.add(chunk.text);

			// Prüfe auf Zeitüberschneidungen mit übernächstem Block
			const nextChunk = result[result.indexOf(chunk) + 1];
			if (nextChunk && chunk.end > nextChunk.start + 0.05) {
				console.warn(
					`⚠️  Zeitüberschneidung: "${chunk.text}" endet bei ${chunk.end}s, nächster startet bei ${nextChunk.start}s`
				);
			}
		}
	}

	return result;
};
