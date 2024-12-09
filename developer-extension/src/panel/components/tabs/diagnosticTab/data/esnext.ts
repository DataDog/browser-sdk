/* eslint-disable */
// @ts-nocheck

const babel = {}
const typescript = {}

const STAGE2 = 'Stage 2'
const STAGE27 = 'Stage 2.7'
const STAGE3 = 'Stage 3'

export const data = [
  {
    name: 'Generator function.sent Meta Property',
    category: STAGE2,
    significance: 'small',
    spec: 'https://github.com/tc39/proposal-function.sent',
    exec() {
      /*
    var result;
    function* generator() {
      result = function.sent;
    }
    var iter = generator();
    iter.next('tromple');
    return result === 'tromple';
  */
    },
    res: {
      babel6corejs2: true,
      ie11: false,
      firefox2: false,
      opera10_50: false,
      chrome77: false,
      duktape2_0: false,
      graalvm19: false,
      hermes0_7_0: false,
      reactnative0_70_3: false,
      rhino1_7_13: false,
    },
  },
  {
    name: 'Class and Property Decorators',
    category: STAGE3,
    significance: 'medium',
    spec: 'https://github.com/tc39/proposal-decorators',
    subtests: [
      {
        name: 'class decorators',
        spec: 'https://github.com/wycats/javascript-decorators',
        exec() {
          /*
        class A {
          @nonconf
          get B() {}
        }
        function nonconf(target, name, descriptor) {
          descriptor.configurable = false;
          return descriptor;
        }
        return Object.getOwnPropertyDescriptor(A.prototype, "B").configurable === false;
      */
        },
        res: {
          babel6corejs2: {
            val: false,
            note_id: 'babel-decorators-legacy',
            note_html:
              "Babel 6 still has no official support decorators, but you can use <a href='https://github.com/loganfsmyth/babel-plugin-transform-decorators-legacy'>this plugin</a>.",
          },
          typescript1corejs2: true,
          ie11: false,
          firefox2: false,
          opera10_50: false,
          chrome77: false,
          duktape2_0: false,
          graalvm19: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
    ],
  },
  {
    name: 'ShadowRealm',
    category: STAGE27,
    significance: 'large',
    spec: 'https://github.com/tc39/proposal-shadowrealm',
    exec() {
      /*
    return typeof ShadowRealm === "function"
      && ["evaluate", "importValue"].every(function(key){
        return key in ShadowRealm.prototype;
      });
  */
    },
    res: {
      ie11: false,
      firefox10: false,
      firefox52: false,
      firefox103: false,
      firefox107: {
        val: 'flagged',
        note_id: 'ff-shadow-realm',
        note_html:
          'The feature has to be enabled via <code>javascript.options.experimental.shadow_realms</code> setting under <code>about:config</code>.',
      },
      opera10_50: false,
      chrome77: false,
      duktape2_0: false,
      graalvm19: false,
      hermes0_7_0: false,
      reactnative0_70_3: false,
      rhino1_7_13: false,
    },
  },
  {
    name: 'throw expressions',
    spec: 'https://github.com/tc39/proposal-throw-expressions',
    category: STAGE2,
    significance: 'medium',
    subtests: [
      {
        name: 'logical',
        exec() {
          /*
        var a, b;
        try {
          a = 19 || throw 77;
          b = 88 && throw 23;
        } catch (e) {
          return a + e === 42;
        }
      */
        },
        res: {
          babel7corejs2: true,
          ie11: false,
          firefox10: false,
          firefox52: false,
          opera10_50: false,
          chrome77: false,
          duktape2_0: false,
          graalvm19: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'parameter initializers',
        exec() {
          /*
        function fn (arg = throw 42) {
          return arg;
        }

        if (fn(21) !== 21) return false;

        try {
          fn();
        } catch (e) {
          return e === 42;
        }
      */
        },
        res: {
          babel7corejs2: true,
          ie11: false,
          firefox10: false,
          firefox52: false,
          opera10_50: false,
          chrome77: false,
          duktape2_0: false,
          graalvm19: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'arrow function bodies',
        exec() {
          /*
        var fn = () => throw 42;
        try {
          fn();
        } catch (e) {
          return e === 42;
        }
      */
        },
        res: {
          babel7corejs2: true,
          ie11: false,
          firefox10: false,
          firefox52: false,
          opera10_50: false,
          chrome77: false,
          duktape2_0: false,
          graalvm19: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'conditionals',
        exec() {
          /*
        true ? 42 : throw 21;
        try {
          false ? 42 : throw 21;
        } catch (e) {
          return e === 21;
        }
      */
        },
        res: {
          babel7corejs2: true,
          ie11: false,
          firefox10: false,
          firefox52: false,
          opera10_50: false,
          chrome77: false,
          duktape2_0: false,
          graalvm19: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
    ],
  },
  {
    name: 'Legacy RegExp features in JavaScript',
    category: STAGE3,
    significance: 'small',
    spec: 'https://github.com/tc39/proposal-regexp-legacy-features',
    subtests: [
      {
        name: 'RegExp "lastMatch"',
        mdn: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/lastMatch',
        exec() {
          const re = /\w/
          re.exec('x')
          return RegExp.lastMatch === 'x'
        },
        res: {
          ie7: true,
          firefox2: true,
          opera7_5: false,
          opera10_10: false,
          opera10_50: true,
          chrome7: true,
          safari3_1: true,
          konq4_4: true,
          besen: false,
          rhino1_7_13: true,
          phantom1_9: true,
          android4_0: true,
          duktape2_0: false,
          nashorn1_8: true,
          nashorn9: true,
          nashorn10: true,
          graalvm19: true,
          hermes0_7_0: true,
          reactnative0_70_3: true,
        },
      },
      {
        name: 'RegExp.$1-$9',
        mdn: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/n',
        exec() {
          for (let i = 1; i < 10; i++) {
            if (!(`$${i}` in RegExp)) {
              return false
            }
          }
          return true
        },
        res: {
          ie7: true,
          firefox2: true,
          opera7_5: true,
          opera10_10: true,
          opera10_50: true,
          chrome7: true,
          safari3_1: true,
          konq4_4: true,
          besen: false,
          rhino1_7_13: true,
          phantom1_9: true,
          android4_0: true,
          duktape2_0: false,
          nashorn1_8: true,
          nashorn9: true,
          nashorn10: true,
          graalvm19: true,
          hermes0_7_0: true,
          reactnative0_70_3: true,
        },
      },
    ],
  },
  {
    name: 'Map.prototype.upsert',
    category: STAGE2,
    significance: 'small',
    spec: 'https://github.com/tc39/proposal-upsert',
    subtests: [
      {
        name: 'Map.prototype.upsert',
        exec() {
          /*
        const map = new Map([['a', 1]]);
        if (map.upsert('a', it => 2, () => 3) !== 2) return false;
        if (map.upsert('b', it => 2, () => 3) !== 3) return false;
        return Array.from(map).join() === 'a,2,b,3';
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'WeakMap.prototype.upsert',
        exec() {
          /*
        const a = {}, b = {};
        const map = new WeakMap([[a, 1]]);
        if (map.upsert(a, it => 2, () => 3) !== 2) return false;
        if (map.upsert(b, it => 2, () => 3) !== 3) return false;
        return map.get(a) === 2 && map.get(b) === 3;
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
    ],
  },
  {
    name: 'Array.isTemplateObject',
    category: STAGE2,
    significance: 'small',
    spec: 'https://github.com/tc39/proposal-array-is-template-object',
    exec() {
      /*
    return !Array.isTemplateObject([])
      && Array.isTemplateObject((it => it)`a${1}c`);
  */
    },
    res: {
      babel6corejs2: false,
      babel7corejs3: babel.corejs,
      typescript1corejs2: typescript.fallthrough,
      typescript3_2corejs3: typescript.corejs,
      ie11: false,
      firefox10: false,
      firefox60: false,
      chrome77: false,
      duktape2_0: false,
      graalvm21_3_3: false,
      hermes0_7_0: false,
      reactnative0_70_3: false,
      rhino1_7_13: false,
    },
  },
  {
    name: 'Async Iterator Helpers',
    category: STAGE2,
    significance: 'large',
    spec: 'https://github.com/tc39/proposal-async-iterator-helpers',
    subtests: [
      {
        name: 'instanceof AsyncIterator',
        exec() {
          /*
        return (async function*() {})() instanceof AsyncIterator;
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
            note_html:
              'The feature is only available on Nightly builds, and has to be enabled via <code>javascript.options.experimental.async_iterator_helpers</code> setting under <code>about:config</code>.',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'extends AsyncIterator',
        exec() {
          /*
        class Class extends AsyncIterator { }
        const instance = new Class();
        return instance[Symbol.asyncIterator]() === instance;
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.from, async iterable',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        const iterator = AsyncIterator.from(async function*() { yield * [1, 2, 3] }());

        if (!('next' in iterator) || !(iterator instanceof AsyncIterator)) return false;

        toArray(iterator).then(it => {
          if (it.join() === '1,2,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.from, iterable',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        const iterator = AsyncIterator.from([1, 2, 3]);

        if (!('next' in iterator) || !(iterator instanceof AsyncIterator)) return false;

        toArray(iterator).then(it => {
          if (it.join() === '1,2,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.from, iterator',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        const iterator = AsyncIterator.from([1, 2, 3].values());

        if (!('next' in iterator) || !(iterator instanceof AsyncIterator)) return false;

        toArray(iterator).then(it => {
          if (it.join() === '1,2,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.drop',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        toArray(async function*() { yield * [1, 2, 3] }().drop(1)).then(it => {
          if (it.join() === '2,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.every',
        exec() {
          /*
        (async function*() { yield * [1, 2, 3] })().every(it => typeof it === 'number').then(it => {
          if (it === true) asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.filter',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        toArray(async function*() { yield * [1, 2, 3] }().filter(it => it % 2)).then(it => {
          if (it.join() === '1,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.find',
        exec() {
          /*
        (async function*() { yield * [1, 2, 3] })().find(it => it % 2).then(it => {
          if (it === 1) asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.flatMap',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        toArray(async function*() { yield * [1, 2, 3] }().flatMap(it => [it, 0])).then(it => {
          if (it.join() === '1,0,2,0,3,0') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.forEach',
        exec() {
          /*
        let result = '';
        (async function*() { yield * [1, 2, 3] })().forEach(it => result += it).then(() => {
          if (result === '123') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.map',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        toArray(async function*() { yield * [1, 2, 3] }().map(it => it * it)).then(it => {
          if (it.join() === '1,4,9') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.reduce',
        exec() {
          /*
        (async function*() { yield * [1, 2, 3] })().reduce((a, b) => a + b).then(it => {
          if (it === 6) asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.some',
        exec() {
          /*
        (async function*() { yield * [1, 2, 3] })().some(it => typeof it === 'number').then(it => {
          if (it === true) asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.take',
        exec() {
          /*
        async function toArray(iterator) {
          const result = [];
          for await (const it of iterator) result.push(it);
          return result;
        }

        toArray(async function*() { yield * [1, 2, 3] }().take(2)).then(it => {
          if (it.join() === '1,2') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype.toArray',
        exec() {
          /*
        (async function*() { yield * [1, 2, 3] })().toArray().then(it => {
          if (Array.isArray(it) && it.join() === '1,2,3') asyncTestPassed();
        });
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          firefox116: false,
          firefox117: {
            val: 'flagged',
            note_id: 'ff-iterator-helpers',
          },
          firefox128: {
            val: 'flagged',
            note_id: 'ff-async-iterator-helpers',
          },
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
      {
        name: 'AsyncIterator.prototype[@@toStringTag]',
        exec() {
          /*
        return AsyncIterator.prototype[Symbol.toStringTag] === 'AsyncIterator';
      */
        },
        res: {
          babel6corejs2: false,
          babel7corejs3: babel.corejs,
          typescript1corejs2: typescript.fallthrough,
          typescript3_2corejs3: typescript.corejs,
          ie11: false,
          firefox10: false,
          firefox60: false,
          chrome77: false,
          duktape2_0: false,
          graalvm21_3_3: false,
          hermes0_7_0: false,
          reactnative0_70_3: false,
          rhino1_7_13: false,
        },
      },
    ],
  },
  {
    name: 'RegExp Escaping',
    category: STAGE3,
    significance: 'medium',
    spec: 'https://github.com/tc39/proposal-regex-escaping',
    exec() {
      /*
    return RegExp.escape("The Quick Brown Fox") === "The\\ Quick\\ Brown\\ Fox" &&
      RegExp.escape("(*.*)") === "\\(\\*\\.\\*\\)" &&
      RegExp.escape("｡^･ｪ･^｡") === "｡\\^･ｪ･\\^｡" &&
      RegExp.escape("\\d \\D (?:)") === "\\\\d \\\\D \\(\\?\\:\\)";
  */
    },
    res: {
      chrome129: false,
      firefox115: false,
    },
  },
  {
    name: 'Uint8Array to/from base64 and hex',
    category: STAGE3,
    significance: 'small',
    spec: 'https://github.com/tc39/proposal-arraybuffer-base64',
    subtests: [
      {
        name: 'Uint8Array.toBase64()',
        exec() {
          /*
        const arr = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        return arr.toBase64() === "SGVsbG8gV29ybGQ=";
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
            note_html:
              'The feature has to be enabled via <code>javascript.options.experimental.uint8array_base64</code> setting under <code>about:config</code>.',
          },
          firefox133: true,
        },
      },
      {
        name: 'Uint8Array.fromBase64()',
        exec() {
          /*
        const arr1 = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        const arr2 = Uint8Array.fromBase64("SGVsbG8gV29ybGQ=");
        return arr1.length === arr2.length &&
               arr1.every((element, index) => element === arr2[index]);
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
          },
          firefox133: true,
        },
      },
      {
        name: 'Uint8Array.setFromBase64()',
        exec() {
          /*
        const arr1 = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        let arr2 = new Uint8Array(16);
        let { read, written } = arr2.setFromBase64("SGVsbG8gV29ybGQ=");
        return read == 16 && written == 11 &&
               arr1.every((element, index) => element === arr2[index]);
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
          },
          firefox133: true,
        },
      },
      {
        name: 'Uint8Array.toHex()',
        exec() {
          /*
        const arr = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        return arr.toHex() === "48656c6c6f20576f726c64";
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
          },
          firefox133: true,
        },
      },
      {
        name: 'Uint8Array.fromHex()',
        exec() {
          /*
        const arr1 = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        const arr2 = Uint8Array.fromHex("48656c6c6f20576f726c64");
        return arr1.length === arr2.length &&
               arr1.every((element, index) => element === arr2[index]);
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
          },
          firefox133: true,
        },
      },
      {
        name: 'Uint8Array.setFromHex()',
        exec() {
          /*
        const arr1 = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
        let arr2 = new Uint8Array(16);
        let { read, written } = arr2.setFromHex("48656c6c6f20576f726c64");
        return read == 22 && written == 11 &&
               arr1.every((element, index) => element === arr2[index]);
      */
        },
        res: {
          ie11: false,
          chrome129: false,
          firefox115: false,
          firefox125: false,
          firefox126: {
            val: 'flagged',
            note_id: 'ff-uint8-hex-base64',
          },
          firefox133: true,
        },
      },
    ],
  },
]
