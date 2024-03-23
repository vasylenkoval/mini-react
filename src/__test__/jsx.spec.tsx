/** @jsx jsx */
import { jsx } from '../jsx';

describe('jsx', () => {
    it('should create basic elements', () => {
        expect(jsx('div', { id: 'foo' }, jsx('a', null, 'bar'), jsx('b', null))).toEqual({
            type: 'div',
            props: {
                id: 'foo',
                children: [
                    {
                        type: 'a',
                        props: {
                            children: [{ type: 'TEXT', props: { nodeValue: 'bar' } }],
                        },
                    },
                    {
                        type: 'b',
                        props: {
                            children: undefined,
                        },
                    },
                ],
            },
        });
    });

    it('should create basic elements from jsx syntax', () => {
        const element = (
            <div id="foo">
                <a>bar</a>
                <b />
            </div>
        );

        expect(element).toEqual({
            type: 'div',
            props: {
                id: 'foo',
                children: [
                    {
                        type: 'a',
                        props: {
                            children: [{ type: 'TEXT', props: { nodeValue: 'bar' } }],
                        },
                    },
                    {
                        type: 'b',
                        props: {
                            children: undefined,
                        },
                    },
                ],
            },
        });
    });
});
