const path = require('path')
const { exec, execWithProcess, readJSON, writeJSON, runNpm } = require('gem-mine-helper')
const { ANTD_MOBILE, FISH_MOBILE } = require('../../constant/ui')
const updateBabelrc = require('./babelrc')

const REACT_IE8_VERSION = '0.14.9'

/**
 * 安装依赖
 * 1. 根据是否选择 IE8，来决定安装 react 版本
 * 2. 非 IE8 项目安装 prop-types、create-react-class 来处理兼容性问题
 * 3. 有指定 UI 库，则安装
 * 4. 如果使用了 antd-mobile，额外安装 rc-form
 */
function installDeps(context) {
  const { root, ui, ie8 } = context
  let reactVersion
  if (ie8) {
    reactVersion = REACT_IE8_VERSION
  } else {
    reactVersion = exec(`npm show react version`)
  }
  context.set('react_version', reactVersion)
  execWithProcess(`npm i react@${reactVersion} react-dom@${reactVersion} --save --loglevel=error`, { cwd: root })
  if (!ie8) {
    execWithProcess(`npm i prop-types create-react-class --save --loglevel=error`, { cwd: root })
  }

  if (ui) {
    const uiVersion = runNpm(`npm show ${ui} version`)
    runNpm(`npm i ${ui} --save --loglevel=error`, { cwd: root })
    context.set('ui_version', uiVersion)

    if (ui === ANTD_MOBILE || ui === FISH_MOBILE) {
      execWithProcess(`npm i rc-form --save`, { cwd: root })
    }

    updateBabelrc(context)
  }
  execWithProcess(`npm i --loglevel=error`, { cwd: root })
}

/**
 * 设置 package.json 文件中的 name
 */
function setPackageJsonName(context) {
  const { root, name: projectName } = context
  const pkgPath = path.join(root, 'package.json')
  const pkg = readJSON(pkgPath)
  pkg.name = projectName
  writeJSON(pkgPath, pkg)
}

/**
 * 检测某个 npm 包是否是最新版本，非最新则更新
 */
function checkAndUpdatePkg(root, name, pkg) {
  const latest = runNpm(`npm show ${name} version`)
  let now
  if (pkg[name]) {
    now = pkg[name].replace(/^\D+/, '')
  }
  if (latest !== now) {
    execWithProcess(`npm i ${name}@latest --save --loglevel=error`, { cwd: root })
    return latest
  }
}

/**
 * 检测 项目中的依赖 是否和 模板中的依赖 版本一致，非一致情况会更新到 模板中对应的版本
 * 非 IE8 项目，会对 react、react-dom、prop-types、create-react-class 更新到最新版本
 */
function updatePackageJson(context) {
  const { root, shadow_path: shadowPath, ie8, ui } = context
  console.log('\n正在检查更新项目依赖包（package.json 中声明的依赖）...\n')
  const pkgPath = path.join(root, 'package.json')
  const pkg = readJSON(pkgPath)
  const newPkg = readJSON(path.join(shadowPath, 'package.json'))
  let shouldInstall = false
  let shouldUpdate = false

  // 非 IE8 项目保持 react、react-dom、prop-types、create-react-class 最新版本
  if (!ie8) {
    const arr = ['react', 'react-dom', 'prop-types', 'create-react-class']
    arr.forEach(name => {
      const version = checkAndUpdatePkg(root, name, pkg.dependencies)
      if (version && name === 'react') {
        context.set('react_version', version)
      }
    })
  } else {
    context.set('react_version', REACT_IE8_VERSION)
  }

  if (ui) {
    checkAndUpdatePkg(root, ui, pkg.dependencies)
    if (ui === ANTD_MOBILE || ui === FISH_MOBILE) {
      checkAndUpdatePkg(root, 'rc-form', pkg.dependencies)
    }
  }

  ;(function(items) {
    items.forEach(function(item) {
      const { key, update } = item
      Object.keys(newPkg[key]).forEach(function(v) {
        if (pkg[key][v] !== newPkg[key][v]) {
          pkg[key][v] = newPkg[key][v]
          if (update) {
            shouldUpdate = true
          } else {
            shouldInstall = true
          }
        }
      })
    })
  })([{ key: 'dependencies' }, { key: 'devDependencies' }, { key: 'scripts', update: true }])
  ;(function(items) {
    items.forEach(function(item) {
      const arr = pkg[item] || []
      const newArr = newPkg[item]
      if (newArr) {
        newArr.forEach(function(v) {
          if (arr.indexOf(v) === -1) {
            arr.push(v)
          }
        })
      }
      if (arr !== pkg[item]) {
        pkg[item] = arr
        shouldUpdate = true
      }
    })
  })(['pre-commit'])

  if (shouldInstall || shouldUpdate) {
    writeJSON(pkgPath, pkg)
    if (shouldInstall) {
      execWithProcess(`npm i --loglevel=error`, { cwd: root })
    }
    console.log('更新项目依赖包成功\n')
  } else {
    console.log('项目中的依赖已经和 gem-mine-template 中一致，无须更新')
  }
}

exports.installDeps = installDeps
exports.setPackageJsonName = setPackageJsonName
exports.updatePackageJson = updatePackageJson
