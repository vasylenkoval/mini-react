import { TEXT_ELEMENT, Props } from './jsx.js';

/**
 * Creates a DOM node for a given type.
 * @param type - DOM tag or "TEXT".
 * @return DOM node.
 */
export function createNode(type: string): Node {
    return type === TEXT_ELEMENT ? document.createTextNode('') : document.createElement(type);
}

const STYLE_PROP = 'style';
const CHILDREN_PROP = 'children';
const FUNCTION_PREFIX = 'on';

const isEvent = (propName: string) => propName.startsWith(FUNCTION_PREFIX);
const isProp = (propName: string) => propName !== CHILDREN_PROP && !isEvent(propName);
const getEventName = (propName: string) => propName.toLowerCase().substring(2);

type EventListener = EventListenerOrEventListenerObject;
/**
 * Adds given properties to a DOM node. Reconciles new props with previous props if provided.
 * @param dom - DOM node to add props to.
 * @param props -  Props to add.
 * @param prevProps - Previously applied props.
 */
export function addProps(dom: Node, props: Props, prevProps?: Props) {
    if (prevProps) {
        // Resets props that are completely removed.
        for (let propToReset in prevProps) {
            if (propToReset in props) {
                continue;
            }
            if (isProp(propToReset)) {
                // @ts-expect-error
                dom[propToReset] = '';
            } else if (isEvent(propToReset)) {
                dom.removeEventListener(
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
        if (isProp(propToAdd)) {
            // @ts-expect-error
            dom[propToAdd] = props[propToAdd];
        } else if (isEvent(propToAdd)) {
            const eventName = getEventName(propToAdd);
            if (prevProps && prevProps[propToAdd]) {
                // Remove previous listener.
                dom.removeEventListener(eventName, prevProps[propToAdd] as EventListener);
            }
            dom.addEventListener(eventName, props[propToAdd] as EventListener);
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
