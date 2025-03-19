// @ts-nocheck
import React from 'react'
import ReactDOM from 'react-dom'
import { init_rum_extensions } from '../../init_rum_extensions'

export const domRender = (Component) => {
    init_rum_extensions()

    const root = document.getElementById('root');
    if (!root) {
        throw new Error('Root element not found');
    }
    
    ReactDOM.render(
        <React.StrictMode>
            <Component />
        </React.StrictMode>,
        root
    );
};