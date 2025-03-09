// src/constants.ts
var EMPTY_ARR = [];

// src/jsx.ts
var propsCompareFnSymbol = Symbol("propsCompareFn");
var TEXT_ELEMENT = "TEXT";
function prepareChildren(elements, children = []) {
  for (const element of elements) {
    const elementType = typeof element;
    if (elementType === "object" && element) {
      if (Array.isArray(element)) {
        prepareChildren(element, children);
      } else {
        children.push(element);
      }
      continue;
    }
    if (elementType === "string" || elementType === "number") {
      children.push({
        type: TEXT_ELEMENT,
        props: { nodeValue: element },
        children: EMPTY_ARR,
        key: null
      });
    }
  }
  return children.length ? children : EMPTY_ARR;
}
function jsx(type, _props, ..._children) {
  const props = _props ?? {};
  let children = null;
  if (_children.length > 0) {
    children = prepareChildren(_children);
    props.children = children;
  }
  const element = {
    type,
    props,
    children,
    key: props.key !== void 0 ? props.key : null
  };
  return element;
}

// src/dom.ts
function createNode(type) {
  return type === TEXT_ELEMENT ? document.createTextNode("") : document.createElement(type);
}
var CHILDREN_PROP = "children";
var FUNCTION_PREFIX = "on";
var isEvent = (propName) => propName.startsWith(FUNCTION_PREFIX);
var isProp = (propName) => propName !== CHILDREN_PROP && !isEvent(propName);
var getEventName = (propName) => propName.toLowerCase().substring(2);
var getPropName = (propName) => propName === "className" ? "class" : propName;
var canSetDirect = (propName, dom) => {
  return propName != "width" && propName != "height" && propName != "href" && propName != "list" && propName != "form" && propName != "tabIndex" && propName != "download" && propName != "rowSpan" && propName != "colSpan" && propName != "role" && propName != "popover" && propName in dom;
};
function addProps(fiberRef, node, props, prevProps) {
  if (node.nodeType === 3) {
    if (node.nodeValue !== props.nodeValue) {
      node.nodeValue = props.nodeValue;
    }
    return;
  }
  const element = node;
  if (prevProps) {
    for (let propToReset in prevProps) {
      if (propToReset in props) {
        continue;
      }
      if (isProp(propToReset)) {
        const propName = getPropName(propToReset);
        element.removeAttribute(propName);
      } else if (isEvent(propToReset)) {
        element.removeEventListener(
          getEventName(propToReset),
          prevProps[propToReset]
        );
      }
    }
  }
  for (let propToAdd in props) {
    if (prevProps && props[propToAdd] === prevProps[propToAdd]) {
      continue;
    }
    const value = props[propToAdd];
    if (isProp(propToAdd) && typeof value === "string") {
      const propName = getPropName(propToAdd);
      if (canSetDirect(propName, element)) {
        element[propName] = value;
      } else {
        element.setAttribute(propName, value);
      }
    } else if (isEvent(propToAdd)) {
      const eventName = getEventName(propToAdd);
      if (prevProps && prevProps[propToAdd]) {
        element.removeEventListener(eventName, prevProps[propToAdd]);
      }
      element.addEventListener(eventName, props[propToAdd]);
    }
  }
  element["__fiberRef"] = fiberRef;
}
var nodeProto = globalThis.Node?.prototype;
var nodeInsertBefore = nodeProto?.insertBefore;
var nodeRemoveChild = nodeProto?.removeChild;
var nodeAppendChild = nodeProto?.appendChild;
function removeChild(parent, child) {
  nodeRemoveChild.call(parent, child);
}
function appendChild(parent, child) {
  nodeAppendChild.call(parent, child);
}
function replaceWith(oldNode, newNode) {
  oldNode.replaceWith(newNode);
}
function insertBefore(parent, node, beforeNode) {
  nodeInsertBefore.call(parent, node, beforeNode);
}
var dom_default = { createNode, addProps, removeChild, appendChild, replaceWith, insertBefore };

// src/hooks.ts
var HookTypes = /* @__PURE__ */ ((HookTypes2) => {
  HookTypes2[HookTypes2["state"] = 0] = "state";
  HookTypes2[HookTypes2["effect"] = 1] = "effect";
  HookTypes2[HookTypes2["ref"] = 2] = "ref";
  HookTypes2[HookTypes2["memo"] = 3] = "memo";
  return HookTypes2;
})(HookTypes || {});
var current = {
  hooks: [],
  notifyOnStateChange: () => {
  },
  scheduleEffect: () => {
  }
};
var hookIndex = -1;
function processHooks(hooks, notifyOnStateChange, scheduleEffect) {
  for (const hook of hooks) {
    if (hook.type === 0 /* state */ && hook.pending) {
      hook.value = hook.pending.value;
      hook.pending = void 0;
    }
  }
  current.hooks = hooks;
  current.notifyOnStateChange = notifyOnStateChange;
  current.scheduleEffect = scheduleEffect;
  hookIndex = -1;
}
function useState(initState) {
  hookIndex++;
  const oldHook = current.hooks[hookIndex];
  if (oldHook) {
    oldHook.notify = current.notifyOnStateChange;
    return [oldHook.value, oldHook.setter];
  }
  const hook = {
    type: 0 /* state */,
    notify: current.notifyOnStateChange,
    value: typeof initState === "function" ? initState() : initState,
    setter(value) {
      let lastValue = hook.pending ? hook.pending.value : hook.value;
      let setterFn = typeof value === "function" ? value : void 0;
      let pendingValue = setterFn ? setterFn(lastValue) : value;
      if (pendingValue === lastValue) return;
      hook.pending = { value: pendingValue };
      hook.notify();
    }
  };
  current.hooks.push(hook);
  return [hook.value, hook.setter];
}
function collectEffectCleanups(hooks) {
  let cleanupFuncs;
  for (let hook of hooks) {
    if (hook.type === 1 /* effect */ && hook.cleanup) {
      (cleanupFuncs ?? (cleanupFuncs = [])).push(hook.cleanup);
    }
  }
  return cleanupFuncs;
}
function executeEffect(effect, hook) {
  const cleanup = effect();
  if (typeof cleanup === "function") {
    hook.cleanup = cleanup;
  }
}
function areDepsEqual(newDeps, prevDeps) {
  if (!newDeps || !prevDeps) {
    return false;
  }
  return newDeps.length === prevDeps.length && (newDeps.length === 0 || newDeps.every((newDep, index) => newDep === prevDeps[index]));
}
function useEffect(effect, deps) {
  hookIndex++;
  const scheduleEffect = current.scheduleEffect;
  const oldHook = current.hooks[hookIndex];
  if (oldHook) {
    if (!areDepsEqual(deps, oldHook.deps)) {
      scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup ?? null);
      oldHook.deps = deps;
    }
    return;
  }
  const hook = {
    type: 1 /* effect */,
    deps
  };
  current.hooks.push(hook);
  scheduleEffect(() => executeEffect(effect, hook), null);
}
function useMemo(valueFn, deps) {
  hookIndex++;
  const oldHook = current.hooks[hookIndex];
  if (oldHook) {
    if (!areDepsEqual(deps, oldHook.deps)) {
      oldHook.deps = deps;
      oldHook.value = valueFn();
    }
    return oldHook.value;
  }
  const hook = {
    type: 3 /* memo */,
    deps,
    value: valueFn()
  };
  current.hooks.push(hook);
  return hook.value;
}
function useRef(initialValue) {
  hookIndex++;
  const oldHook = current.hooks[hookIndex];
  if (oldHook) {
    return oldHook.value;
  }
  const hook = {
    type: 2 /* ref */,
    value: { current: initialValue }
  };
  current.hooks.push(hook);
  return hook.value;
}
function useReducer(reducer, initStateOrArg, initFn) {
  const ref = useRef({
    dispatch: void 0,
    initState: initFn ? initFn(initStateOrArg) : initStateOrArg
  });
  const [state, setState] = useState(ref.current.initState);
  if (ref.current.dispatch) {
    return [state, ref.current.dispatch];
  }
  function dispatch(action) {
    setState((prevState) => reducer(prevState, action));
  }
  ref.current.dispatch = dispatch;
  return [state, dispatch];
}

// src/scheduler.ts
function schedule(fn) {
  return fn(defaultRemaining);
}
function defaultRemaining() {
  return 100;
}

// src/fiber.ts
var APP_ROOT = "root";
var nextUnitOfWork;
var componentRenderQueue = [];
var wipRoot;
var currentRoot;
var deletions = [];
var effectsToRun = [];
var effectCleanupsToRun = [];
var afterCommitCbs = [];
var DOM = dom_default;
var defaultShallowEqual = (_prevProps, _nextProps) => {
  return false;
};
function getNewFiber() {
  const props = { key: null, children: EMPTY_ARR };
  const fiber = {
    parent: null,
    child: null,
    sibling: null,
    type: "",
    props,
    effectTag: 0 /* add */,
    old: null,
    isOld: false,
    dom: null,
    stateNode: null,
    didChangePos: false,
    version: 0,
    childElements: EMPTY_ARR,
    fromElement: {
      type: "",
      props,
      children: EMPTY_ARR,
      key: null
    },
    propsCompareFn: defaultShallowEqual
  };
  fiber.stateNode = {
    current: fiber,
    hooks: []
  };
  return fiber;
}
function createRoot(root, element, fakeDom) {
  if (fakeDom) {
    DOM = fakeDom;
  }
  const fiber = getNewFiber();
  fiber.type = APP_ROOT;
  fiber.dom = root;
  fiber.props = { key: null, children: [element] };
  fiber.fromElement = {
    type: "div",
    props: fiber.props,
    children: [element],
    key: null
  };
  wipRoot = fiber;
  nextUnitOfWork = fiber;
  schedule(workloop);
}
function addToComponentRenderQueue(fiber) {
  if (!componentRenderQueue.includes(fiber)) {
    componentRenderQueue.push(fiber);
    schedule(workloop);
  }
}
function nonSkippedAndNotPositionChanged(f) {
  return f.didChangePos || f.effectTag !== 3 /* skip */;
}
function commitRoot() {
  for (const fiberToDelete of deletions) {
    deleteFiber(fiberToDelete);
  }
  deletions = [];
  if (wipRoot) {
    let nextFiberToCommit = wipRoot;
    while (nextFiberToCommit) {
      commitFiber(nextFiberToCommit);
      nextFiberToCommit = nextFiber(
        nextFiberToCommit,
        wipRoot,
        nonSkippedAndNotPositionChanged,
        nextFiberToCommit.effectTag === 3 /* skip */
      );
    }
    for (let i = afterCommitCbs.length - 1; i >= 0; i--) {
      afterCommitCbs[i]();
    }
    afterCommitCbs.splice(0);
    if (wipRoot.type === APP_ROOT) {
      currentRoot = wipRoot;
    } else {
      const originalFiber = wipRoot.old;
      const parent = wipRoot.parent;
      let nextChild = parent.child;
      if (nextChild === originalFiber) {
        parent.child = wipRoot;
      } else {
        while (nextChild) {
          if (nextChild.sibling === originalFiber) {
            nextChild.sibling = wipRoot;
            break;
          }
          nextChild = nextChild.sibling;
        }
      }
    }
  }
  wipRoot = null;
  for (let i = effectCleanupsToRun.length - 1; i >= 0; i--) {
    effectCleanupsToRun[i]();
  }
  effectCleanupsToRun.splice(0);
  for (let i = effectsToRun.length - 1; i >= 0; i--) {
    effectsToRun[i]();
  }
  effectsToRun.splice(0);
}
function withDom(f) {
  return !!f.dom;
}
function nonComponent(f) {
  return typeof f.type !== "string";
}
function deleteFiber(fiber) {
  const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, withDom)?.dom;
  if (closestChildDOM && closestChildDOM.parentNode) {
    DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
  }
  let nextComponentChildFiber = fiber;
  while (nextComponentChildFiber) {
    if (nextComponentChildFiber.stateNode.hooks.length) {
      const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode.hooks);
      if (cleanupFuncs) {
        effectCleanupsToRun.push(...cleanupFuncs.reverse());
      }
    }
    nextComponentChildFiber = findNextFiber(nextComponentChildFiber, fiber, nonComponent);
  }
  fiber.effectTag = 2 /* delete */;
  fiber.isOld = true;
  fiber.old = null;
  fiber.child = null;
  fiber.sibling = null;
  fiber.parent = null;
  fiber.dom = null;
  fiber.stateNode = null;
  fiber.childElements = EMPTY_ARR;
}
function commitFiber(fiber) {
  if (fiber.didChangePos) {
    const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, withDom)?.dom;
    const closestNextSiblingDom = fiber.sibling ? fiber.sibling?.dom ?? findNextFiber(fiber.sibling, fiber, withDom)?.dom ?? null : null;
    if (closestChildDom) {
      afterCommitCbs.push(() => {
        if (closestChildDom.nextSibling !== closestNextSiblingDom) {
          DOM.insertBefore(
            closestChildDom.parentNode,
            closestChildDom,
            closestNextSiblingDom
          );
        }
      });
    }
  }
  if (!(fiber.dom && fiber.parent) || fiber.effectTag === 3 /* skip */) {
    return;
  }
  let parentWithDom = fiber.parent;
  while (!parentWithDom.dom) {
    parentWithDom = parentWithDom.parent;
  }
  if (fiber.effectTag === 1 /* update */) {
    DOM.addProps(fiber, fiber.dom, fiber.props, fiber.old?.props || null);
  }
  if (fiber.effectTag === 0 /* add */) {
    const parent = parentWithDom.dom;
    const child = fiber.dom;
    DOM.appendChild(parent, child);
  }
  return;
}
function pickNextComponentToRender() {
  if (!componentRenderQueue.length) {
    return null;
  }
  const componentFiber = componentRenderQueue.shift();
  if (componentFiber.isOld) {
    return pickNextComponentToRender();
  }
  const newFiber = getNewFiber();
  newFiber.type = componentFiber.type;
  newFiber.parent = componentFiber.parent;
  newFiber.child = componentFiber.child;
  newFiber.sibling = componentFiber.sibling;
  newFiber.old = componentFiber;
  newFiber.isOld = false;
  newFiber.dom = componentFiber.dom;
  const stateNode = componentFiber.stateNode;
  newFiber.stateNode = stateNode;
  stateNode.current = newFiber;
  newFiber.effectTag = 1 /* update */;
  newFiber.didChangePos = false;
  newFiber.props = componentFiber.props;
  newFiber.version = componentFiber.version + 1;
  newFiber.childElements = componentFiber.childElements;
  newFiber.fromElement = componentFiber.fromElement;
  newFiber.propsCompareFn = componentFiber.propsCompareFn;
  componentFiber.old = null;
  componentFiber.isOld = true;
  return newFiber;
}
function workloop(remainingMs) {
  let shouldWait = false;
  while (nextUnitOfWork && !shouldWait) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldWait = remainingMs() < 1;
  }
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  const nextComponent = pickNextComponentToRender();
  if (nextComponent) {
    wipRoot = nextComponent;
    nextUnitOfWork = wipRoot;
    schedule(workloop);
    return;
  }
  if (wipRoot) {
    schedule(workloop);
  }
}
function processComponentFiber(fiber) {
  if (propsCompareFnSymbol in fiber.type && fiber.type[propsCompareFnSymbol]) {
    fiber.propsCompareFn = fiber.type[propsCompareFnSymbol];
  }
  let componentEffects;
  let componentEffectCleanups;
  const stateNode = fiber.stateNode;
  processHooks(
    stateNode.hooks,
    function notifyOnStateChange() {
      addToComponentRenderQueue(stateNode.current);
    },
    function scheduleEffect(effect, cleanup) {
      (componentEffects ?? (componentEffects = [])).push(effect);
      if (cleanup) {
        (componentEffectCleanups ?? (componentEffectCleanups = [])).push(cleanup);
      }
    }
  );
  const element = fiber.type(fiber.props);
  fiber.childElements = [element];
  if (componentEffects) {
    effectsToRun.push(...componentEffects.reverse());
  }
  if (componentEffectCleanups) {
    effectCleanupsToRun.push(...componentEffectCleanups.reverse());
  }
}
function processDomFiber(fiber) {
  if (!fiber.dom) {
    fiber.dom = DOM.createNode(fiber.type);
    DOM.addProps(fiber, fiber.dom, fiber.props, null);
  }
  fiber.childElements = fiber.fromElement.children ?? EMPTY_ARR;
}
function performUnitOfWork(fiber) {
  if (typeof fiber.type === "string") {
    processDomFiber(fiber);
  }
  if (typeof fiber.type === "function") {
    processComponentFiber(fiber);
  }
  diffChildren(fiber, fiber.childElements);
  return nextFiber(fiber, wipRoot, nonSkipped);
}
function nonSkipped(f) {
  return f.effectTag !== 3 /* skip */;
}
function defaultPredicate() {
  return true;
}
function nextFiber(currFiber, root, continueFn = defaultPredicate, skipChild = false) {
  if (!skipChild && currFiber.child && continueFn(currFiber.child)) {
    return currFiber.child;
  }
  let current2 = skipChild ? currFiber : currFiber.child ?? currFiber;
  while (current2 && current2 !== root) {
    let sibling = current2.sibling;
    while (sibling) {
      if (continueFn(sibling)) {
        return sibling;
      }
      sibling = sibling.sibling;
    }
    current2 = current2.parent;
  }
  return null;
}
function nextFiber2(currFiber, root) {
  let current2 = currFiber;
  if (current2.child) {
    return current2.child;
  }
  while (current2 && current2 !== root) {
    let sibling = current2.sibling;
    if (sibling) {
      return sibling;
    }
    current2 = current2.parent;
  }
  return null;
}
function findNextFiber(currFiber, root, predicate) {
  if (!currFiber) {
    return null;
  }
  let next = nextFiber2(currFiber, root);
  while (next) {
    if (predicate(next)) {
      return next;
    }
    next = nextFiber2(next, root);
  }
  return null;
}
function diffChildren(wipFiberParent, elements) {
  if (!elements.length && !!wipFiberParent.dom && !!wipFiberParent.parent && !!wipFiberParent.old && !!wipFiberParent.old.child) {
    const old = wipFiberParent.old;
    deletions.push(old);
    wipFiberParent.old = null;
    wipFiberParent.effectTag = 0 /* add */;
    wipFiberParent.childElements = EMPTY_ARR;
    wipFiberParent.child = null;
    wipFiberParent.dom = DOM.createNode(wipFiberParent.type);
    DOM.addProps(wipFiberParent, wipFiberParent.dom, wipFiberParent.props, null);
    return;
  }
  let oldFiber = wipFiberParent.old?.child ?? null;
  let prevNewFiber = null;
  let index = 0;
  const existingFibers = /* @__PURE__ */ new Map();
  let currentOldFiber = oldFiber;
  let oldIndex = 0;
  while (currentOldFiber) {
    const key = currentOldFiber.fromElement.key ?? oldIndex;
    existingFibers.set(key, { fiber: currentOldFiber, index: oldIndex });
    currentOldFiber = currentOldFiber.sibling;
    oldIndex++;
  }
  for (let newIdx = 0; newIdx < elements.length; newIdx++) {
    const childElement = elements[newIdx];
    const key = childElement.key ?? newIdx;
    const existing = existingFibers.get(key);
    let newFiber = null;
    if (existing) {
      const { fiber: oldFiber2, index: oldIdx } = existing;
      existingFibers.delete(key);
      if (oldFiber2.type === childElement.type) {
        newFiber = reuseFiber(childElement, wipFiberParent, oldFiber2);
        newFiber.didChangePos = newIdx !== oldIdx;
        const shouldSkip = oldFiber2.fromElement === childElement || typeof childElement.type !== "string" && newFiber.propsCompareFn?.(oldFiber2.props, childElement.props);
        if (shouldSkip) {
          newFiber.effectTag = 3 /* skip */;
          newFiber.child = oldFiber2.child;
          let sibling = oldFiber2.child;
          while (sibling) {
            sibling.parent = newFiber;
            sibling = sibling.sibling;
          }
        }
        oldFiber2.old = null;
        oldFiber2.isOld = true;
        oldFiber2.sibling = null;
        oldFiber2.parent = null;
      } else {
        deletions.push(oldFiber2);
        newFiber = addNewFiber(childElement, wipFiberParent);
      }
    } else {
      newFiber = addNewFiber(childElement, wipFiberParent);
    }
    if (newFiber) {
      if (index === 0) wipFiberParent.child = newFiber;
      else prevNewFiber.sibling = newFiber;
      prevNewFiber = newFiber;
      index++;
    }
  }
  existingFibers.forEach(({ fiber }) => deletions.push(fiber));
}
function addNewFiber(element, parent) {
  const newFiber = getNewFiber();
  newFiber.type = element.type;
  newFiber.parent = parent;
  newFiber.props = element.props;
  newFiber.fromElement = element;
  newFiber.effectTag = 0 /* add */;
  if (typeof element.type === "string") {
    newFiber.propsCompareFn = defaultShallowEqual;
  }
  return newFiber;
}
function reuseFiber(element, parent, oldFiber) {
  const newFiber = getNewFiber();
  newFiber.type = element.type;
  newFiber.parent = parent;
  newFiber.old = oldFiber;
  newFiber.dom = oldFiber.dom;
  newFiber.effectTag = 1 /* update */;
  newFiber.props = element.props;
  newFiber.version = oldFiber.version + 1;
  newFiber.fromElement = element;
  newFiber.propsCompareFn = oldFiber.propsCompareFn;
  const stateNode = oldFiber.stateNode;
  stateNode.current = newFiber;
  newFiber.stateNode = stateNode;
  return newFiber;
}

// src/memo.ts
function shallowEqual(prevProps, nextProps) {
  if (prevProps === nextProps) return true;
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);
  if (prevKeys.length !== nextKeys.length) return false;
  for (let i = 0; i < prevKeys.length; i++) {
    const key = prevKeys[i];
    if (prevProps[key] !== nextProps[key]) return false;
  }
  return true;
}
function memo(Component, compareFn = shallowEqual) {
  function Memo(props) {
    return Component(props);
  }
  Memo[propsCompareFnSymbol] = compareFn;
  return Memo;
}
export {
  HookTypes,
  TEXT_ELEMENT,
  collectEffectCleanups,
  createRoot,
  jsx,
  memo,
  processHooks,
  propsCompareFnSymbol,
  shallowEqual,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
};
//# sourceMappingURL=bundle.js.map
