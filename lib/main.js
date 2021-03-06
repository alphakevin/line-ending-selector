'use babel'

import _ from 'underscore-plus'
import {CompositeDisposable, Disposable} from 'atom'
import SelectListView from 'atom-select-list'
import StatusBarItem from './status-bar-item'
import helpers from './helpers'

const LineEndingRegExp = /\r\n|\n|\r/g

let disposables = null
let modalPanel = null
let lineEndingListView = null

export function activate () {
  disposables = new CompositeDisposable()

  disposables.add(atom.commands.add('atom-text-editor', {
    'line-ending-selector:show': (event) => {
      if (!modalPanel) {
        lineEndingListView = new SelectListView({
          items: [{name: 'LF', value: '\n'}, {name: 'CRLF', value: '\r\n'}],
          filterKeyForItem: (lineEnding) => lineEnding.name,
          didConfirmSelection: (lineEnding) => {
            setLineEnding(atom.workspace.getActivePaneItem(), lineEnding.value)
            modalPanel.hide()
          },
          didCancelSelection: () => {
            modalPanel.hide()
          },
          elementForItem: (lineEnding) => {
            const element = document.createElement('li')
            element.textContent = lineEnding.name
            return element
          }
        })
        modalPanel = atom.workspace.addModalPanel({item: lineEndingListView})
        disposables.add(new Disposable(() => {
          lineEndingListView.destroy()
          modalPanel.destroy()
          modalPanel = null
        }))
      }

      lineEndingListView.reset()
      modalPanel.show()
      lineEndingListView.focus()
    },

    'line-ending-selector:convert-to-LF': (event) => {
      const editorElement = event.target.closest('atom-text-editor')
      setLineEnding(editorElement.getModel(), '\n')
    },

    'line-ending-selector:convert-to-CRLF': (event) => {
      const editorElement = event.target.closest('atom-text-editor')
      setLineEnding(editorElement.getModel(), '\r\n')
    }
  }))
}

export function deactivate () {
  disposables.dispose()
}

export function consumeStatusBar (statusBar) {
  let statusBarItem = new StatusBarItem()
  let currentBufferDisposable = null
  let tooltipDisposable = null

  function updateTile (buffer) {
    let lineEndings = getLineEndings(buffer)
    if (lineEndings.size === 0) {
      let defaultLineEnding = getDefaultLineEnding()
      buffer.setPreferredLineEnding(defaultLineEnding)
      lineEndings = new Set().add(defaultLineEnding)
    }
    statusBarItem.setLineEndings(lineEndings)
  }

  let debouncedUpdateTile = _.debounce(updateTile, 0)

  disposables.add(atom.workspace.observeActivePaneItem((item) => {
    if (currentBufferDisposable) currentBufferDisposable.dispose()

    if (item && item.getBuffer) {
      let buffer = item.getBuffer()
      updateTile(buffer)
      currentBufferDisposable = buffer.onDidChange(({oldText, newText}) => {
        if (!statusBarItem.hasLineEnding('\n')) {
          if (newText.indexOf('\n') >= 0) {
            debouncedUpdateTile(buffer)
          }
        } else if (!statusBarItem.hasLineEnding('\r\n')) {
          if (newText.indexOf('\r\n') >= 0) {
            debouncedUpdateTile(buffer)
          }
        } else if (LineEndingRegExp.test(oldText)) {
          debouncedUpdateTile(buffer)
        }
      })
    } else {
      statusBarItem.setLineEndings(new Set())
      currentBufferDisposable = null
    }

    if (tooltipDisposable) {
      disposables.remove(tooltipDisposable)
      tooltipDisposable.dispose()
    }
    tooltipDisposable = atom.tooltips.add(statusBarItem.element,
      {title: `File uses ${statusBarItem.description()} line endings`})
    disposables.add(tooltipDisposable)
  }))

  disposables.add(new Disposable(() => {
    if (currentBufferDisposable) currentBufferDisposable.dispose()
  }))

  statusBarItem.onClick(() => {
    atom.commands.dispatch(
      atom.views.getView(atom.workspace.getActivePaneItem()),
      'line-ending-selector:show'
    )
  })

  let tile = statusBar.addRightTile({item: statusBarItem.element, priority: 200})
  disposables.add(new Disposable(() => tile.destroy()))
}

function getDefaultLineEnding () {
  switch (atom.config.get('line-ending-selector.defaultLineEnding')) {
    case 'LF':
      return '\n'
    case 'CRLF':
      return '\r\n'
    case 'OS Default':
    default:
      return (helpers.getProcessPlatform() === 'win32') ? '\r\n' : '\n'
  }
}

function getLineEndings (buffer) {
  let result = new Set()
  for (let i = 0; i < buffer.getLineCount() - 1; i++) {
    result.add(buffer.lineEndingForRow(i))
  }
  return result
}

function setLineEnding (item, lineEnding) {
  if (item && item.getBuffer) {
    let buffer = item.getBuffer()
    buffer.setPreferredLineEnding(lineEnding)
    buffer.setText(buffer.getText().replace(LineEndingRegExp, lineEnding))
  }
}
