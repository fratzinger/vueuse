---
category: State
related: useLocalStorage, useSessionStorage, useStorageAsync
---

# useStorage

Create a reactive ref that can be used to access & modify [LocalStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) or [SessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

Uses localStorage by default, other storage sources be specified via third argument.

## Usage

::: tip
When using with Nuxt 3, this function will **NOT** be auto imported in favor of Nitro's built-in [`useStorage()`](https://nitro.unjs.io/guide/storage). Use explicit import if you want to use the function from VueUse.
:::

```ts
import { useStorage } from '@vueuse/core'

// bind object
const state = useStorage('my-store', { hello: 'hi', greeting: 'Hello' })

// bind boolean
const flag = useStorage('my-flag', true) // returns Ref<boolean>

// bind number
const count = useStorage('my-count', 0) // returns Ref<number>

// bind string with SessionStorage
const id = useStorage('my-id', 'some-string-id', sessionStorage) // returns Ref<string>

// delete data from storage
state.value = null
```

## Merge Defaults

By default, `useStorage` will use the value from storage if it is present and ignores the default value. Be aware that when you are adding more properties to the default value, the key might be `undefined` if client's storage does not have that key.

```ts
import { useStorage } from '@vueuse/core'
// ---cut---
localStorage.setItem('my-store', '{"hello": "hello"}')

const state = useStorage('my-store', { hello: 'hi', greeting: 'hello' }, localStorage)

console.log(state.value.greeting) // undefined, since the value is not presented in storage
```

To solve that, you can enable `mergeDefaults` option.

```ts
import { useStorage } from '@vueuse/core'
// ---cut---
localStorage.setItem('my-store', '{"hello": "nihao"}')

const state = useStorage(
  'my-store',
  { hello: 'hi', greeting: 'hello' },
  localStorage,
  { mergeDefaults: true } // <--
)

console.log(state.value.hello) // 'nihao', from storage
console.log(state.value.greeting) // 'hello', from merged default value
```

When setting it to true, it will perform a **shallow merge** for objects. You can pass a function to perform custom merge (e.g. deep merge), for example:

```ts
import { useStorage } from '@vueuse/core'
// ---cut---
const state = useStorage(
  'my-store',
  { hello: 'hi', greeting: 'hello' },
  localStorage,
  { mergeDefaults: (storageValue, defaults) => deepMerge(defaults, storageValue) } // <--
)
```

## Custom Serialization

By default, `useStorage` will smartly use the corresponding serializer based on the data type of provided default value. For example, `JSON.stringify` / `JSON.parse` will be used for objects, `Number.toString` / `parseFloat` for numbers, etc.

You can also provide your own serialization function to `useStorage`:

```ts
import { useStorage } from '@vueuse/core'

useStorage(
  'key',
  {},
  undefined,
  {
    serializer: {
      read: (v: any) => v ? JSON.parse(v) : null,
      write: (v: any) => JSON.stringify(v),
    },
  },
)
```

Please note when you provide `null` as the default value, `useStorage` can't assume the data type from it. In this case, you can provide a custom serializer or reuse the built-in ones explicitly.

```ts
import { StorageSerializers, useStorage } from '@vueuse/core'

const objectLike = useStorage('key', null, undefined, { serializer: StorageSerializers.object })
objectLike.value = { foo: 'bar' }
```
