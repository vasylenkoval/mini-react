import { TEXT_ELEMENT, Props } from './jsx.js';

/**
 * Creates a DOM node for a given type.
 * @param type - DOM tag or "TEXT".
 * @return DOM Node.
 */
export function createNode(type: string): Node {
    return type === TEXT_ELEMENT ? document.createTextNode('') : document.createElement(type);
}

const CHILDREN_PROP = 'children';
const FUNCTION_PREFIX = 'on';

const isEvent = (propName: string) => propName.startsWith(FUNCTION_PREFIX);
const isProp = (propName: string) => propName !== CHILDREN_PROP && !isEvent(propName);
const getEventName = (propName: string) => propName.toLowerCase().substring(2);
const getPropName = (propName: string) => (propName === 'className' ? 'class' : propName);

type EventListener = EventListenerOrEventListenerObject;
/**
 * Adds given properties to a DOM node. Reconciles new props with previous props if provided.
 * @param dom - DOM node to add props to.
 * @param props -  Props to add.
 * @param prevProps - Previously applied props.
 */
export function addProps(node: Node, props: Props, prevProps?: Props) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#node.text_node
    if (node.nodeType === 3) {
        if (node.nodeValue !== props.nodeValue) {
            node.nodeValue = props.nodeValue as string;
        }
        return;
    }

    const element = node as Element;
    if (prevProps) {
        // Resets props that are completely removed.
        for (let propToReset in prevProps) {
            if (propToReset in props) {
                continue;
            }
            if (isProp(propToReset)) {
                element.removeAttribute(getPropName(propToReset));
            } else if (isEvent(propToReset)) {
                element.removeEventListener(
                    getEventName(propToReset),
                    prevProps[propToReset] as EventListener
                );
            }
        }
    }

    // Add new props, compares to previous and updates if not equal
    for (let propToAdd in props) {
        if (prevProps && props[propToAdd] === prevProps[propToAdd]) {
            continue;
        }
        const value = props[propToAdd];
        if (isProp(propToAdd) && typeof value === 'string') {
            element.setAttribute(getPropName(propToAdd), value);
        } else if (isEvent(propToAdd)) {
            const eventName = getEventName(propToAdd);
            if (prevProps && prevProps[propToAdd]) {
                element.removeEventListener(eventName, prevProps[propToAdd] as EventListener);
            }
            element.addEventListener(eventName, props[propToAdd] as EventListener);
        }
    }
}

/**
 * Remove child from a given parent.
 */
function removeChild(parent: Node, child: Node) {
    parent.removeChild(child);
}

/**
 * Append child to a given parent.
 */
function appendChild(parent: Node, child: Node) {
    parent.appendChild(child);
}

export default { createNode, addProps, removeChild, appendChild };
