/**
 * ESLint 配置文件
 *
 * 使用 ESLint Flat Config (扁平化配置) 格式
 * 文档: https://eslint.org/docs/latest/use/configure/configuration-files-new
 *
 * 本配置适用于 Vue 3 + TypeScript + Monorepo 项目
 */
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint, { parser as tsParser } from 'typescript-eslint'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import importPlugin from 'eslint-plugin-import'
import eslintPluginJsonc from 'eslint-plugin-jsonc'
import markdown from '@eslint/markdown'
import pluginVue from 'eslint-plugin-vue'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  /**
   * 忽略文件配置
   * 指定 ESLint 不检查的目录和文件
   * 包括构建产物、依赖、缓存等
   * 注意：在 Flat Config 中，ignores 必须放在配置数组的最前面
   */
  {
    ignores: [
      // 依赖目录
      'node_modules',
      // 构建产物
      'dist',
      'dist-*',
      // 锁文件
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      // 缓存目录
      '.cache',
      '.eslintcache',
      'coverage',
      // 临时文件
      '*.tmp',
      '*.temp',
      // IDE 配置
      '.vscode',
      '.idea',
      // 环境配置
      '.env',
      '.env.*',
      // 日志文件
      '*.log',
      'logs',
      // Vite 构建缓存（包括子目录）
      '**/.vite',
      // 库目录（包括子目录）
      '**/lib',
      // 静态资源目录（包括子目录）
      '**/assets',
      // 公共目录（包括子目录）
      '**/public',
      // 构建输出目录（包括子目录）
      '**/out',
    ],
  },

  /**
   * 基础语言选项配置
   * 配置全局变量和 ECMAScript 版本
   * - ecmaVersion: 使用最新 ECMAScript 语法
   * - sourceType: ES 模块
   * - globals: 注入浏览器、ES2025、Node.js 全局变量
   */
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2025, ...globals.node },
    },
  },

  /**
   * ESLint 推荐规则
   * 包含 ESLint 官方推荐的最佳实践规则
   * 如：no-unused-vars, no-undef, no-console 等
   */
  eslint.configs.recommended,

  /**
   * TypeScript ESLint 推荐规则
   * 提供 TypeScript 特有的静态检查规则
   * 如：类型检查、接口规范、类型导入等
   */
  ...tseslint.configs.recommended,

  /**
   * Import 插件配置
   * 用于检查 ES6+ import/export 语法
   * - recommended: 推荐规则（检查导入语法正确性）
   * - typescript: TypeScript 支持（识别 TS 路径别名）
   */
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  /**
   * JSON/JSONC/JSON5 插件配置
   * 用于检查 JSON 文件语法和格式
   * 支持 JSON5 语法（注释、尾随逗号等）
   */
  ...eslintPluginJsonc.configs['flat/recommended-with-json5'],

  /**
   * Unicorn 插件规则配置
   * Unicorn 提供了一系列实用的 ESLint 规则
   * 用于改进代码质量和一致性，推荐更现代的写法
   */
  {
    languageOptions: {
      globals: globals.builtin,
    },
    plugins: {
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      // ==================== 错误预防规则 ====================

      // 要求自定义错误类使用正确的命名（以 Error 结尾）和构造方式
      'unicorn/custom-error-definition': 'error',
      // 要求在抛出错误时使用完整的错误消息，避免 throw new Error('')
      'unicorn/error-message': 'error',
      // 要求转义字符使用小写形式（如 \n 而非 \N），保持一致性
      'unicorn/escape-case': 'error',
      // 要求使用 new 关键字调用内置构造函数（如 new Error() 而非 Error()）
      'unicorn/new-for-builtins': 'error',
      // 禁止无效的 removeEventListener 调用（参数与 addEventListener 不匹配）
      'unicorn/no-invalid-remove-event-listener': 'error',
      // 禁止使用 new Array()，建议使用数组字面量 []，更简洁清晰
      'unicorn/no-new-array': 'error',
      // 禁止使用 new Buffer()，建议使用 Buffer.alloc() 或 Buffer.from()（更安全）
      'unicorn/no-new-buffer': 'error',

      // ==================== 代码优化规则 ====================

      // 禁止将 this 作为数组方法的参数（如 arr.map(fn, this) 改用箭头函数）
      'unicorn/no-array-method-this-argument': 'error',
      // 禁止连续使用 push 方法，建议使用 arr.push(...items) 或扩展运算符
      'unicorn/no-array-push-push': 'error',
      // 禁止在 console 方法中使用空格作为参数，避免输出混乱
      'unicorn/no-console-spaces': 'error',
      // 建议使用数组方法替代 for 循环，提高代码可读性
      'unicorn/no-for-loop': 'error',
      // 禁止使用十六进制转义序列（\x1B），建议使用 Unicode 转义（\u001B）
      'unicorn/no-hex-escape': 'error',
      // 要求使用 Array.isArray() 而非 instanceof Array（跨 frame 安全）
      'unicorn/no-instanceof-array': 'error',

      // ==================== 关闭的规则 ====================

      // 关闭不安全正则检查（某些场景需要复杂正则，如密码验证）
      'unicorn/no-unsafe-regex': 'off',

      // ==================== 风格一致性规则 ====================

      // 要求数字字面量使用一致的大小写（小写），如 0xff 而非 0xFF
      'unicorn/number-literal-case': 'error',

      // ==================== 现代语法偏好规则 ====================

      // 建议使用 Array.find() 替代 filter()[0]，更高效且语义清晰
      'unicorn/prefer-array-find': 'error',
      // 建议使用 Array.flatMap() 替代 map().flat()，一次遍历完成
      'unicorn/prefer-array-flat-map': 'error',
      // 建议使用 Array.indexOf() 替代 findIndex()（简单值比较时更高效）
      'unicorn/prefer-array-index-of': 'error',
      // 建议使用 Array.some() 替代 find() !== undefined，语义更清晰
      'unicorn/prefer-array-some': 'error',
      // 建议使用 Date.now() 替代 new Date().getTime()，更简洁高效
      'unicorn/prefer-date-now': 'error',
      // 建议使用 dataset 属性替代 getAttribute/setAttribute 操作 data-* 属性
      'unicorn/prefer-dom-node-dataset': 'error',
      // 建议使用 String.includes() 替代 indexOf() !== -1，更易读
      'unicorn/prefer-includes': 'error',
      // 建议使用 KeyboardEvent.key 替代已废弃的 keyCode
      'unicorn/prefer-keyboard-event-key': 'error',
      // 建议使用 Math.trunc() 替代位运算截断（~~num），更语义化
      'unicorn/prefer-math-trunc': 'error',
      // 建议使用现代 DOM API（如 append、prepend、remove）
      'unicorn/prefer-modern-dom-apis': 'error',
      // 建议使用负索引访问数组末尾元素（arr.at(-1) 替代 arr[arr.length - 1]）
      'unicorn/prefer-negative-index': 'error',
      // 建议使用 Number.isNaN() 替代全局 isNaN()（更准确，不转换类型）
      'unicorn/prefer-number-properties': 'error',
      // 建议使用可选的 catch 绑定（ES2019，不需要 error 参数时可省略）
      'unicorn/prefer-optional-catch-binding': 'error',
      // 建议使用原型方法而非实例方法提取（如 [].map.call 改用 Array.prototype.map.call）
      'unicorn/prefer-prototype-methods': 'error',
      // 建议使用 querySelector 替代 getElementById 等，API 更统一
      'unicorn/prefer-query-selector': 'error',
      // 建议使用 Reflect.apply 替代 Function.prototype.apply.call
      'unicorn/prefer-reflect-apply': 'error',
      // 建议使用 String.slice() 替代 substring()，参数处理更一致
      'unicorn/prefer-string-slice': 'error',
      // 建议使用 startsWith/endsWith 替代正则或 indexOf 检查前缀后缀
      'unicorn/prefer-string-starts-ends-with': 'error',
      // 建议使用 trimStart/trimEnd 替代 trimLeft/trimRight（标准命名）
      'unicorn/prefer-string-trim-start-end': 'error',
      // 建议抛出 TypeError 而非其他错误类型（类型检查失败时）
      'unicorn/prefer-type-error': 'error',
      // 要求使用 throw new Error() 而非 throw Error()，保持一致性
      'unicorn/throw-new-error': 'error',
    },
  },

  /**
   * Markdown 文件配置
   * 用于检查 Markdown 文件中的代码块
   * 确保文档中的示例代码符合规范
   */
  markdown.configs.recommended,
  markdown.configs.processor,

  /**
   * Vue 插件配置
   * 提供 Vue 3 单文件组件的检查规则
   * 包括模板语法、脚本组织、样式作用域等
   */
  ...pluginVue.configs['flat/recommended'],

  /**
   * Prettier 配置
   * 集成 Prettier 代码格式化
   * 自动禁用与 Prettier 冲突的 ESLint 规则
   */
  eslintPluginPrettierRecommended,

  /**
   * 自定义规则配置
   * 覆盖和扩展默认规则，根据项目需求调整
   */
  {
    rules: {
      // ==================== JavaScript/TypeScript 基础规则 ====================

      // 驼峰命名规则：变量和函数必须使用驼峰命名
      // properties: 'never' 表示属性名允许非驼峰（如 API 返回的 snake_case 数据）
      camelcase: ['error', { properties: 'never' }],
      // 禁止 console 语句（警告级别），但允许 console.error 用于错误日志
      'no-console': ['warn', { allow: ['error'] }],
      // 禁止 debugger 语句（警告级别），生产代码不应包含
      'no-debugger': 'warn',
      // 禁止常量作为循环条件，但允许无限循环 while(true)
      'no-constant-condition': ['error', { checkLoops: false }],
      // 禁止特定语法：标签语句（易造成混乱）和 with 语句（已废弃）
      'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
      // 禁止不必要的 return await（直接返回 Promise 更高效）
      'no-return-await': 'error',
      // 禁止 var 声明，强制使用 let/const（块级作用域）
      'no-var': 'error',
      // 禁止空块，但允许空 catch 块（忽略错误场景）
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 优先使用 const 声明不会重新赋值的变量
      'prefer-const': [
        'warn',
        { destructuring: 'all', ignoreReadBeforeAssign: true },
      ],
      // 优先使用箭头函数作为回调（更简洁，this 绑定更清晰）
      'prefer-arrow-callback': [
        'error',
        { allowNamedFunctions: false, allowUnboundThis: true },
      ],
      // 对象属性简写：{ foo } 而非 { foo: foo }
      'object-shorthand': [
        'error',
        'always',
        { ignoreConstructors: false, avoidQuotes: true },
      ],
      // 优先使用剩余参数 ...args 替代 arguments 对象
      'prefer-rest-params': 'error',
      // 优先使用扩展运算符 ... 替代 Object.assign/Array.concat
      'prefer-spread': 'error',
      // 优先使用模板字符串 `hello ${name}` 替代字符串拼接
      'prefer-template': 'error',

      // 关闭 JS 的 no-redeclare，使用 TS 版本（支持函数重载）
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',

      // ==================== 最佳实践规则 ====================

      // 数组迭代方法必须有返回值（map、filter、reduce 等）
      'array-callback-return': 'error',
      // 强制块级作用域变量声明，避免变量提升问题
      'block-scoped-var': 'error',
      // 禁止 alert（警告级别），生产环境应使用自定义弹窗
      'no-alert': 'warn',
      // switch 语句中必须使用块级作用域（避免变量穿透）
      'no-case-declarations': 'error',
      // 禁止多行字符串（使用模板字符串替代）
      'no-multi-str': 'error',
      // 禁止 with 语句（已废弃，严格模式下报错）
      'no-with': 'error',
      // 禁止 void 操作符（用途有限，易造成困惑）
      'no-void': 'error',

      // Import 成员排序规则（仅排序成员，声明排序由 import/order 处理）
      'sort-imports': [
        'warn',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: false,
        },
      ],

      // ==================== 样式规则 ====================

      // 优先使用指数运算符 ** 替代 Math.pow()
      'prefer-exponentiation-operator': 'error',

      // ==================== TypeScript 特有规则 ====================

      // 关闭模块边界类型检查（允许隐式 any 导出，适合渐进式迁移）
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // 允许 any 类型（适合渐进式类型迁移）
      '@typescript-eslint/no-explicit-any': 'off',
      // 允许非空断言 !（某些场景确实需要）
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 允许非空断言可选链 ?.!
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      // 允许 @ts-ignore 注释（绕过类型检查，需谨慎使用）
      '@typescript-eslint/ban-ts-comment': ['off', { 'ts-ignore': false }],
      // 允许 require 导入（兼容 CommonJS 模块）
      '@typescript-eslint/no-require-imports': 'off',
      // 允许未使用的表达式（如短路求值 a && b()）
      '@typescript-eslint/no-unused-expressions': 'off',

      // ==================== Vue 规则 ====================

      // 允许 v-html（需开发者自行确保安全，避免 XSS）
      'vue/no-v-html': 'off',
      // 不强制要求默认 prop（可选 prop 可以不设默认值）
      'vue/require-default-prop': 'off',
      // 不强制要求显式 emits 声明（适合渐进式迁移）
      'vue/require-explicit-emits': 'off',
      // 不强制多词组件名（单文件组件已足够清晰）
      'vue/multi-word-component-names': 'off',
      // 不强制从 vue 导入（自动导入场景）
      'vue/prefer-import-from-vue': 'off',
      // 禁止在组件上使用 v-text/v-html（应使用插槽）
      'vue/no-v-text-v-html-on-component': 'off',
      // Vue 块（script、template、style）之间需要空行
      'vue/padding-line-between-blocks': ['warn', 'always'],
      // Vue 自闭合标签规则：所有标签都应自闭合
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always',
          },
          svg: 'always',
          math: 'always',
        },
      ],

      // ==================== Prettier 规则 ====================

      // Prettier 格式化错误视为 ESLint 错误
      'prettier/prettier': 'error',

      // ==================== Import 插件规则 ====================

      // import 语句必须放在文件顶部（模块声明之后）
      'import/first': 'error',
      // 禁止重复导入同一模块（合并导入语句）
      'import/no-duplicates': 'error',
      // Import 排序规则：按类型分组，提高可读性
      'import/order': [
        'error',
        {
          // 分组顺序：内置模块 -> 外部模块 -> 内部模块 -> 父级 -> 同级 -> 索引 -> 类型
          groups: [
            'builtin',
            ['external', 'internal', 'parent', 'sibling', 'index', 'object'],
            'type',
          ],
          // 特定路径的分组规则
          pathGroups: [
            {
              pattern: 'vue',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@vue/**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@tina-chris/**',
              group: 'internal',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          sortTypesGroup: true,
          'newlines-between': 'never',
          'newlines-between-types': 'always',
        },
      ],
      // 关闭未解析导入检查（由 TypeScript 编译器处理）
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/named': 'off',
      // import 语句后必须有一个空行
      'import/newline-after-import': ['error', { count: 1 }],
    },
  },

  /**
   * JSON 文件配置
   * 使用 JSONC 解析器处理 JSON/JSON5/JSONC 文件
   * 支持注释和尾随逗号
   */
  {
    files: ['*.json', '*.json5', '*.jsonc'],
    languageOptions: {
      parser: eslintPluginJsonc.parser,
    },
  },

  /**
   * 测试文件配置
   * 放宽测试文件中的规则限制
   * 测试代码允许 console 和单文件多组件
   */
  {
    files: ['**/__tests__/**/*', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
      'vue/one-component-per-file': 'off',
    },
  },

  /**
   * package.json 配置
   * 强制 package.json 中键的排序顺序
   * 遵循 npm 最佳实践，重要字段在前
   */
  {
    files: ['package.json'],
    languageOptions: {
      parser: eslintPluginJsonc.parser,
    },
    rules: {
      'jsonc/sort-keys': [
        'error',
        {
          // 根级别键的排序顺序
          pathPattern: '^$',
          order: [
            'name',
            'version',
            'private',
            'packageManager',
            'description',
            'type',
            'keywords',
            'homepage',
            'bugs',
            'license',
            'author',
            'contributors',
            'funding',
            'files',
            'main',
            'module',
            'exports',
            'unpkg',
            'jsdelivr',
            'browser',
            'bin',
            'man',
            'directories',
            'repository',
            'publishConfig',
            'scripts',
            'peerDependencies',
            'peerDependenciesMeta',
            'optionalDependencies',
            'dependencies',
            'devDependencies',
            'engines',
            'config',
            'overrides',
            'pnpm',
            'husky',
            'lint-staged',
            'eslintConfig',
          ],
        },
        // dependencies 字段按字母升序排列
        {
          pathPattern: '^(?:dev|peer|optional|bundled)?[Dd]ependencies$',
          order: { type: 'asc' },
        },
      ],
    },
  },

  /**
   * TypeScript 声明文件配置
   * 允许声明文件中的重复导入（类型扩展场景）
   */
  {
    files: ['*.d.ts'],
    rules: {
      'import/no-duplicates': 'off',
    },
  },

  /**
   * JavaScript 文件配置
   * 允许 JS 文件中使用 require（兼容 CommonJS）
   */
  {
    files: ['*.js', '*.cjs', '*.mjs'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  /**
   * TypeScript 文件配置
   * 强制使用类型导入语法 import type
   * 提高代码可读性，区分类型导入和值导入
   */
  {
    files: ['*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
    },
  },

  /**
   * Vue 单文件组件配置
   * 配置 Vue 文件的解析器和类型检查规则
   * 使用 TypeScript 解析器处理 <script lang="ts">
   */
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
    },
  },

  /**
   * Markdown 中的代码块配置
   * 放宽文档中示例代码的规则限制
   * 文档示例代码不需要完整的环境配置
   */
  {
    files: ['**/*.md/*.js', '**/*.md/*.ts', '**/*.md/*.vue'],
    rules: {
      'no-console': 'off',
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  /**
   * Play 开发环境配置
   * 放宽 play 目录下的规则限制
   * 开发调试环境允许更多灵活性
   */
  {
    files: ['play/**/*.{js,jsx,ts,tsx,vue}'],
    rules: {
      'no-console': 'off',
      'no-debugger': 'off',
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  /**
   * 内部工具包配置
   * 限制 internal 和基础包的导入依赖
   * 这些包是底层基础设施，不应依赖上层业务代码
   */
  {
    files: ['internal/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@tina-chris/components',
                '@tina-chris/hooks',
                '@tina-chris/utils',
                '@tina-chris/theme-chalk',
              ],
              message:
                'Internal packages should not depend on other @tina-chris packages.',
            },
          ],
        },
      ],
    },
  },

  /**
   * 基础工具包配置
   * 限制 utils、hooks 的导入依赖
   * 这些是底层包，不应依赖上层组件
   * 确保依赖方向正确：components -> hooks/utils
   */
  {
    files: [
      'packages/utils/**/*.{js,jsx,ts,tsx,vue}',
      'packages/hooks/**/*.{js,jsx,ts,tsx,vue}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tina-chris/components', '@tina-chris/theme-chalk'],
              message:
                'Base packages (utils/hooks) should not depend on components or theme.',
            },
          ],
        },
      ],
    },
  },

  /**
   * 组件包配置
   * 限制 components 包的导入依赖
   * 组件可以依赖 hooks 和 utils，但不能反向依赖
   */
  {
    files: ['packages/components/**/*.{js,jsx,ts,tsx,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@tina-chris/theme-chalk/**/*.scss',
                '!@tina-chris/theme-chalk/src/*.scss',
              ],
              message: 'Use @tina-chris/theme-chalk/src/*.scss instead.',
            },
            {
              group: [
                '@tina-chris/theme-chalk/**/*.css',
                '!@tina-chris/theme-chalk/*.css',
              ],
              message: 'Use @tina-chris/theme-chalk/*.css instead.',
            },
          ],
        },
      ],
    },
  },
])
