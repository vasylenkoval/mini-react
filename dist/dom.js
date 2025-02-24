import { TEXT_ELEMENT } from './jsx.js';
/**
 * Creates a DOM node for a given type.
 * @param type - DOM tag or "TEXT".
 * @return DOM Node.
 */
export function createNode(type) {
    return type === TEXT_ELEMENT ? document.createTextNode('') : document.createElement(type);
}
const CHILDREN_PROP = 'children';
const FUNCTION_PREFIX = 'on';
const isEvent = (propName) => propName.startsWith(FUNCTION_PREFIX);
const isProp = (propName) => propName !== CHILDREN_PROP && !isEvent(propName);
const getEventName = (propName) => propName.toLowerCase().substring(2);
const getPropName = (propName) => (propName === 'className' ? 'class' : propName);
const canSetDirect = (propName, dom) => {
    // TODO(val): snippet from preact, figure out the reason why these
    // properties have to be set with setAttribute specifically.
    return (propName != 'width' &&
        propName != 'height' &&
        propName != 'href' &&
        propName != 'list' &&
        propName != 'form' &&
        propName != 'tabIndex' &&
        propName != 'download' &&
        propName != 'rowSpan' &&
        propName != 'colSpan' &&
        propName != 'role' &&
        propName != 'popover' &&
        propName in dom);
};
/**
 * Adds given properties to a DOM node. Reconciles new props with previous props if provided.
 * @param dom - DOM node to add props to.
 * @param props -  Props to add.
 * @param prevProps - Previously applied props.
 */
export function addProps(node, props, prevProps) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#node.text_node
    if (node.nodeType === 3) {
        if (node.nodeValue !== props.nodeValue) {
            node.nodeValue = props.nodeValue;
        }
        return;
    }
    // @TODO: figure out why buttons and some other elements do not attach id
    // Also figure out why value is not being reset on inputs
    const element = node;
    if (prevProps) {
        // Resets props that are completely removed.
        for (let propToReset in prevProps) {
            if (propToReset in props) {
                continue;
            }
            if (isProp(propToReset)) {
                const propName = getPropName(propToReset);
                element.removeAttribute(propName);
            }
            else if (isEvent(propToReset)) {
                element.removeEventListener(getEventName(propToReset), prevProps[propToReset]);
            }
        }
    }
    // Add new props, compare to previous and update only if not equal
    for (let propToAdd in props) {
        if (prevProps && props[propToAdd] === prevProps[propToAdd]) {
            continue;
        }
        const value = props[propToAdd];
        if (isProp(propToAdd) && typeof value === 'string') {
            const propName = getPropName(propToAdd);
            if (canSetDirect(propName, element)) {
                element[propName] = value;
            }
            else {
                element.setAttribute(propName, value);
            }
        }
        else if (isEvent(propToAdd)) {
            const eventName = getEventName(propToAdd);
            if (prevProps && prevProps[propToAdd]) {
                element.removeEventListener(eventName, prevProps[propToAdd]);
            }
            element.addEventListener(eventName, props[propToAdd]);
        }
    }
}
const nodeProto = globalThis.Node?.prototype;
const nodeInsertBefore = nodeProto?.insertBefore;
const nodeRemoveChild = nodeProto?.removeChild;
const nodeAppendChild = nodeProto?.appendChild;
/**
 * Remove child from a given parent.
 */
function removeChild(parent, child) {
    nodeRemoveChild.call(parent, child);
}
/**
 * Append child to a given parent.
 */
function appendChild(parent, child) {
    nodeAppendChild.call(parent, child);
}
function replaceWith(oldNode, newNode) {
    oldNode.replaceWith(newNode);
}
function insertBefore(parent, node, beforeNode) {
    nodeInsertBefore.call(parent, node, beforeNode);
}
export default { createNode, addProps, removeChild, appendChild, replaceWith, insertBefore };
