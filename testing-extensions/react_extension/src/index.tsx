// @ts-nocheck
import React from 'react'
import ReactDOM from 'react-dom'

export const domRender = (Component) => {
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