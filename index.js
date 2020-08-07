let PluginTitle = 'DependencyParsePlugin';


const regArrMatch = (str, regArr) => regArr.some((_) => str.match(_));
const regMathArr = (reg, Arr) => Arr.some((_) => _.match(reg));

const getModuleResource = (_) => {
  if (!_) {
    return;
  }
  if (_.resource) {
    return _.resource;
  } else if (_.module) {
    return getModuleResource(_.module);
  }
  return;
}

class DependencyParsePlugin {
  // 每个文件的直接依赖
  directDeps = {};

  // 每个文件的所有依赖
  allDeps = {};

  options = {
    includes: [],
    excludes: [],
    /**
     * {
     *  name: 'react',
     *  ignore: [],
     *  blackList: [], // suport reg
     *  whiteList: [], // suport reg
     * }
     */
    detectDependences: [],
  };

  constructor(options) {
    this.options = Object.assign({}, this.options, options);
  }

  parseOneFileAllDependency = (filePath) => {
    const dfs = (filePath) => {
      const temp = this.directDeps[filePath] || [];
      const deps = [];
      deps.push(...temp);
      temp.forEach((_) => {
        if (this.allDeps[_]) {
          deps.push(...this.allDeps[_]);
        } else {
          deps.push(...dfs(_));
        }
      });
      this.allDeps[filePath] = Array.from(new Set(deps));
      return deps;
    };
    dfs(filePath);
  };

  parseModule = (module) => {
    let resource = module && module.resource;

    if (!resource || this.directDeps[resource] || resource.includes('node_modules')) {
      return resource;
    }

    const {
      includes,
      excludes
    } = this.options;
    if (includes.some((_) => resource.match(_))) {

    } else if (excludes.some((_) => resource.match(_))) {
      return resource;
    }
    this.directDeps[resource] = [];
    (module.dependencies || []).forEach((_) => {

      const r = this.parseModule(_.module);

      if (r) {
        this.directDeps[resource].push(r);
      }
    });

    return resource;
  };

  parseTargetDependencies = () => {
    const {
      allDeps,
      directDeps,
      options
    } = this;
    const {
      detectDependences
    } = options;
    const filePaths = Object.keys(allDeps);
    const importPaths = [];

    detectDependences.forEach((item) => {
      const {
        name,
        blackList = [],
        whiteList = [],
        ignores = ['node_modules']
      } = item;
      const tempSet = new Set();

      filePaths.forEach((file) => {
        if (ignores.length && regArrMatch(file, ignores)) {
          return;
        }
        // 白名单代表可以引用
        if (whiteList.length && regArrMatch(file, whiteList)) {
          return;
          // 黑名单代表不可以引用
        } else if (blackList.length && regArrMatch(file, blackList)) {

        } else {
          // 两个名单都不在代表可以引用
          return;
        }
        const values = allDeps[file];
        values.some((v) => {
          if (v.match(name) && regMathArr(name, directDeps[file])) {
            tempSet.add(file);
            return true;
          }
        });
      });

      // 对引用路径进行解析
      const parseImportPaths = (set) => {
        const result = [];
        const arr = Array.from(set);
        const dfs = (currentPath, paths = [currentPath]) => {
          let hasParent = false;
          Object.keys(directDeps).forEach((_) => {
            const v = directDeps[_];
            if (v.includes(currentPath)) {
              hasParent = true;
              const temp = [...paths, _];
              dfs(_, temp);
            }
          });
          if (!hasParent) {
            result.push(paths);
          }
        };
        arr.forEach((_) => dfs(_));
        return result;
      };

      importPaths.push({
        name,
        paths: parseImportPaths(tempSet),
      })
    });

    return importPaths;
  };

  apply(compiler) {
    // 解析依赖树
    compiler.hooks.compilation.tap(PluginTitle, (compilation) => {
      compilation.hooks.optimizeModules.tap(PluginTitle, (modules) => {
        modules.forEach(this.parseModule);
        // 对解析完的依赖树进行过滤-去重
        Object.keys(this.directDeps).forEach((key) => {
          this.directDeps[key] = Array.from(new Set(this.directDeps[key].filter((_) => _ != key)));
          if (this.directDeps[key].length === 0) {
            delete this.directDeps[key];
          }
        })
      });

    });

    // 编译完成，回抛依赖树
    compiler.hooks.done.tap(PluginTitle, () => {
      Object.keys(this.directDeps).forEach(this.parseOneFileAllDependency);
      // 对解析完的依赖树进行过滤-去重
      Object.keys(this.allDeps).forEach((key) => {
        this.allDeps[key] = Array.from(new Set(this.allDeps[key].filter((_) => _ != key)));
        if (this.allDeps[key].length === 0) {
          delete this.allDeps[key];
        }
      })
      const {
        callback,
        detectDependences
      } = this.options;
      if (callback) {
        const params = {
          directDeps: this.directDeps,
          allDeps: this.allDeps,
        };
        if (detectDependences && detectDependences.length) {
          params.detectDependences = this.parseTargetDependencies();
        }
        callback(params);
      }

      // 执行完-清空数据
      this.allDeps = {};
      this.directDeps = {};
    });
  }
}

module.exports = DependencyParsePlugin;