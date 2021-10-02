/**
 * 是否是严格模式
 */
export let isStrict = false;

/**
 * 设置严格或非严格模式
 */
export default function useStrict(strict: boolean) {
	const prevStrict = isStrict;
	isStrict = strict;
	return prevStrict;
}
