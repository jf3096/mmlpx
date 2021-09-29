/**
 * @author Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2017-09-13
 */

import initializeStore from './initializers/store';
import initializeViewModel from './initializers/viewModel';
import Injector, { Scope } from './Injector';
import { IMmlpx, modelNameSymbol, modelTypeSymbol, storeSymbol, viewModelSymbol } from './meta';

/**
 * 唯一 UID
 */
let uid = 0;

/**
 * 用于缓存单例注射器
 */
let cachedInjector: Injector;

/**
 * 获取注射器
 */
export function getInjector() {
	/**
	 * 如果注射器不存在，创建被缓存
	 */
	return cachedInjector || (cachedInjector = Injector.newInstance());
}

/**
 * 更新单例注射器
 */
export function setInjector(newInjector: Injector) {
	cachedInjector = newInjector;
}

/**
 * 示例
 */
export default function instantiate<T>(this: any, InjectedClass: IMmlpx<T>, ...args: any[]): T {
 	/**
	 * 获取注射器
	 */
	const injector = getInjector();
        /**
	 * 被注入 class， 这些 class 满足以下方式
	 * // 单例，支持 IOC 依赖注入
	 * @store 
	 * class User {}
	 *
	 * // 多例，跟随组件 component 创建和销毁
	 * @ViewModel
	 * class User {}
	 */
	switch (InjectedClass[modelTypeSymbol]) {
		// 命中 @store class User {} 场景
		case storeSymbol:
			// 创建 store 和被注入的 class （args 估计用来 new 这个 class 传值用的）
			return initializeStore.call(this, injector, InjectedClass, ...args);
			
		// 命中 @ViewModel class User {} 场景
		case viewModelSymbol:
			// 创建 ViewStore 和被注入的 class （args 估计用来 new 这个 class 传值用的）
			return initializeViewModel.call(this, injector, InjectedClass, ...args);

		default:
			// 对于无法区分类型的被注入 class， 加入唯一标识的名称
			const name = InjectedClass[modelNameSymbol] = InjectedClass[modelNameSymbol] || `${(InjectedClass.name || '')}_${uid++}`;
			
			return injector.get(InjectedClass, {
				scope: Scope.Singleton,
				name,
			}, ...args);
	}
}
