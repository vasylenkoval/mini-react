/** @jsx jsx */
import { jsx } from '../jsx';

describe('jsx', () => {
    it('should create basic elements', () => {
        expect(jsx('div', { id: 'foo' }, jsx('a', null, 'bar'), jsx('b'))).toEqual({
            type: 'div',
            props: {
                id: 'foo',
                children: [
                    {
                        type: 'a',
                        props: {
                            children: ['bar'],
                        },
                    },
                    {
                        type: 'b',
                        props: {
                            children: [],
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
                            children: ['bar'],
                        },
                    },
                    {
                        type: 'b',
                        props: {
                            children: [],
                        },
                    },
                ],
            },
        });
    });
});
