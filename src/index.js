import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { Router, hashHistory } from 'react-router';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import lightBaseTheme from 'material-ui/styles/baseThemes/lightBaseTheme';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import routes from './routes';
import configureStore from './store/configureStore';
import configure from './configuration';
import { setKeyStore, KeyStoreIndexedDB } from 'keysavcore';
import './app.scss';

if (process.env['NODE_ENV'] === 'production')
  alert('This is very much alpha quality software. Expect things to break and your data to be lost.');

const store = configureStore();
configure(store);

const muiTheme = getMuiTheme(lightBaseTheme);

setKeyStore(new KeyStoreIndexedDB());

render(
  <Provider store={store}>
    <MuiThemeProvider muiTheme={muiTheme}>
      <Router history={hashHistory}>
        {routes}
      </Router>
    </MuiThemeProvider>
  </Provider>,
  document.getElementById('root')
);