let PluginTitle = 'DependencyParsePlugin';
const fs =require('fs');


class DependencyParsePlugin {
  // 每个文件的直接依赖
  directDeps = {};

  // 每个文件的所有依赖
  allDeps = {};

  options = {
    includes: [],
    excludes: [],
  };

  constructor(options) {
    this.options = Object.assign({}, this.options, options);
  }

  parseOneFileAllDependency = (filePath) => {
    const result = {};
    let i = 0;
    const len = Object.keys(this.directDeps).length;
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
      this.allDeps[filePath] = deps;
      return deps;
    };
    dfs(filePath);
  };

  parseModule = (module) => {
    if (!module || !module.resource || this.directDeps[module.resource]) {
      return;
    }
    const { includes, excludes }  = this.options;
    if (includes.some((_) => module.resource.match(_))) {
      
    } else if (excludes.some((_) => module.resource.match(_))) {
      return;
    }
    this.directDeps[module.resource] = [];
    (module.dependencies || []).forEach((_) => {
      const r  = this.parseModule(_.module);
      if (r) {
        this.directDeps[module.resource].push(r);
      }
    });
  
    return module.resource;
  };

  apply(compiler) {
    // 解析依赖树
    compiler.hooks.compilation.tap(PluginTitle, (compilation) => {
      compilation.hooks.optimizeModules.tap(PluginTitle, (modules) => {
        modules.forEach(this.parseModule)
      });
      
    });

    // 编译完成，回抛依赖树
    compiler.hooks.done.tap(PluginTitle, () => {
      Object.keys(this.directDeps).forEach(this.parseOneFileAllDependency);
      const { callback } = this.options;
      if (callback) {
        callback({
          directDeps: this.directDeps,
          allDeps: this.allDeps,
        });
      }
    });
  }
}

module.exports = DependencyParsePlugin;