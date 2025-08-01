import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

// Polyfill for node version < 18
function findLast<T>(arr: T[], cb: (element: T, index: number, array: T[]) => boolean): T | undefined {
  let index = arr.length
  while (index-- > 0) {
    if (cb(arr[index], index, arr))
      return arr[index]
  }
  return undefined
}

export type UseArrayFindLastReturn<T = any> = ComputedRef<T | undefined>

/**
 * Reactive `Array.findLast`
 *
 * @see https://vueuse.org/useArrayFindLast
 * @param list - the array was called upon.
 * @param fn - a function to test each element.
 *
 * @returns the last element in the array that satisfies the provided testing function. Otherwise, undefined is returned.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function useArrayFindLast<T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: MaybeRefOrGetter<T>[]) => boolean,
): UseArrayFindLastReturn<T> {
  return computed(() =>
    toValue<T | undefined>(
      !Array.prototype.findLast
        ? findLast(toValue(list), (element, index, array) => fn(toValue(element), index, array))
        : toValue(list)
            .findLast((element, index, array) => fn(toValue(element), index, array)),
    ))
}
