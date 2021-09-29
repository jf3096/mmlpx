/**
 * @author Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2018-06-25 17:01
 */

import { mergeWith, pull } from 'lodash';
import { _getGlobalState, comparer, IReactionDisposer, reaction, runInAction } from 'mobx';
import Injector, { Snapshot } from '../core/dependency-inject/Injector';
import { getInjector, setInjector } from '../core/dependency-inject/instantiate';
import { isArray, isMap, isObject } from '../utils/types';
import genReactiveInjector from './genReactiveInjector';

/**
 * 快照阶段
 */
enum SNAPSHOT_PHASE {
	/**
	 * 打补丁中
	 */
	PATCHING,
	/**
	 * 完成
	 */
	DONE,
}

/**
 * 快照阶段：完成 （初始值）
 */ 
let phase = SNAPSHOT_PHASE.DONE;

/**
 * 序列化并深度便利注射器的对象模型用与开启依赖跟踪
 * @param model - 对象模型
 * @returns {Snapshot} serialization - 序列化后的快照
 */
function walkAndSerialize(model: any) {
        /**
	 * 如果对象模型是数组类型，访问其长度可以开启跟踪 （mobx 响应跟踪）
	 */ 
	if (isArray(model)) {
		/**
		 * 进入对象模型便利进行深度解析
		 */
		return model.length ? model.map((value: any) => walkAndSerialize(value)) : [];
	}

	/**
         * 是否是 ES6 Map
	 */
	if (isMap(model)) {
		/**
		 * 对象长度 > 1
		 */
		if (model.size) {
			const map: any = {};
			/**
			 * 遍历模型
			 */
			model.forEach((value: any, key: string) => {
				/**
				 * 深度遍历
				 */
				map[key] = walkAndSerialize(value);
			});
			return map;
		}
		/**
		 * 返回普通对象类型 Map => Plain Object
		 */
		return {};
	}
	/**
	 * 如果是对象类型
	 */
	if (isObject(model)) {
		/**
		 * 遍历对象
		 */
		return Object.keys(model).reduce((acc, stateName) => {
			acc[stateName] = walkAndSerialize(model[stateName]);
			return acc;
		}, {} as Snapshot);
	}

	return model;
}

/**
 * 劫持 mobx 全局 state 去执行一个处理器在所有（mobx）响应完成后
 * hijack the mobx global state to run a processor after all reactions finished
 * @see https://github.com/mobxjs/mobx/blob/master/src/core/reaction.ts#L242
 * :dark magic: （黑魔法）
 * @param {() => void} processor
 */
function processAfterReactionsFinished(processor: () => void) {
	// compatible with mobx 3
	const getGlobalState = _getGlobalState || /* istanbul ignore next */ require('mobx').extras.getGlobalState;
	const globalState = getGlobalState();
	const previousDescriptor = Object.getOwnPropertyDescriptor(globalState, 'isRunningReactions');
	let prevValue: boolean = globalState.isRunningReactions;
	Object.defineProperty(globalState, 'isRunningReactions', {
		get() {
			return prevValue;
		},
		set(v: boolean) {
			prevValue = v;
			if (v === false) {
				Object.defineProperty(globalState, 'isRunningReactions', previousDescriptor!);
				processor();
			}
		},
	});
}

export function applySnapshot(snapshot: Snapshot, injector = getInjector()) {

	if (isObject(snapshot)) {
		patchSnapshot(snapshot, injector);
	}
}

export function patchSnapshot(patcher: Snapshot, injector = getInjector()) {

	const currentModels = injector.dump();

	phase = SNAPSHOT_PHASE.PATCHING;

	runInAction(() => {

		// make a copy of patcher to avoid referencing the original patcher after merge
		const clonedPatcher = JSON.parse(JSON.stringify(patcher));
		const mergedModels = mergeWith(currentModels, clonedPatcher, (original: any, source: any) => {

			// while source less than original, means the data list has items removed, so the overflowed data should be dropped
			if (isArray(original)) {
				original.length = source.length;
			}

			// while the keys of source object less than original, means some properties should be removed in original after patch
			if (isObject(original)) {
				pull(Object.keys(original), ...Object.keys(source)).forEach((key: string) => delete original[key]);
			}

			if (isMap(original)) {
				original.clear();
				Object.keys(source).forEach((key: string) => {
					original.set(key, source[key]);
				});
			}
		});

		injector.load(mergedModels);
	});

	processAfterReactionsFinished(() => phase = SNAPSHOT_PHASE.DONE);
}

/**
 * 获取快照
 */
export function getSnapshot(injector?: Injector): Snapshot;
export function getSnapshot(modelName: string, injector?: Injector): Snapshot;
export function getSnapshot(arg1: any, arg2?: any) {
        /**
	 * model 模型名称
	 */
	if (typeof arg1 === 'string') {
		/**
		 * 深度遍历并获得快照
		 * args 可以是 injector，如果为空时直接 getInjector 获取注射器然后拿出“水”
		 */
		const snapshot = walkAndSerialize((arg2 || getInjector()).dump());
		return snapshot[arg1];
	} else {
		return walkAndSerialize((arg1 || getInjector()).dump());
	}
}

export function onSnapshot(onChange: (snapshot: Snapshot) => void, injector?: Injector): IReactionDisposer;
export function onSnapshot(modelName: string, onChange: (snapshot: Snapshot) => void, injector?: Injector): IReactionDisposer;
export function onSnapshot(arg1: any, arg2: any, arg3?: any) {

	let snapshot: () => Snapshot;
	let onChange: (snapshot: Snapshot) => void;
	let injector: Injector;
	if (typeof arg1 === 'string') {
		onChange = arg2;
		injector = genReactiveInjector(arg3 || getInjector());
		snapshot = () => getSnapshot(arg1, injector);
	} else {
		onChange = arg1;
		injector = genReactiveInjector(arg2 || getInjector());
		snapshot = () => getSnapshot(injector);
	}
	setInjector(injector);

	const disposer = reaction(
		snapshot,
		changedSnapshot => {
			// only trigger snapshot listeners when snapshot processed
			if (phase === SNAPSHOT_PHASE.DONE) {
				onChange(changedSnapshot);
			}
		},
		{ equals: comparer.structural },
	);

	return disposer;
}
