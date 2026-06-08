import type { Element, ElementContent, Root } from 'hast'
import type { Literal } from 'mdast'
import { CONTINUE, SKIP, visit } from 'unist-util-visit'

const blockIdentifierRegex = /(?<identifier> *\^(?<name>[\w-]+))$/

export function rehypeObsidian() {
  return function transformer(tree: Root) {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'blockquote') {
        const lastChild = node.children.at(-1)
        if (
          lastChild?.type !== 'element' ||
          !(lastChild.tagName === 'p' || lastChild.tagName === 'ul' || lastChild.tagName === 'ol')
        ) {
          return CONTINUE
        }
        const lastGrandChild = lastChild.children.at(-1)
        if (lastChild.tagName === 'p') {
          return transformBlockIdentifier(node, lastGrandChild)
        } else if (lastGrandChild?.type === 'element' && lastGrandChild.tagName === 'li') {
          return transformBlockIdentifier(node, lastGrandChild.children.at(-1))
        }
      } else if (node.tagName === 'p' || node.tagName === 'li') {
        return transformBlockIdentifier(node, node.children.at(-1))
      }
      return CONTINUE
    })
  }
}

function transformBlockIdentifier(reference: Element, node: ElementContent | undefined) {
  if (!isNodeWithValue(node)) {
    return CONTINUE
  }
  const identifier = getBlockIdentifer(node)
  if (!identifier) {
    return CONTINUE
  }
  node.value = node.value.slice(0, identifier.length * -1)
  reference.properties['id'] = `block-${identifier.name}`
  return SKIP
}

function isNodeWithValue(node: ElementContent | undefined): node is NodeWithValue {
  return node !== undefined && 'value' in node
}

function getBlockIdentifer(node: NodeWithValue): { length: number; name: string } | undefined {
  const match = blockIdentifierRegex.exec(node.value)
  const identifier = match?.groups?.['identifier']
  const name = match?.groups?.['name']
  if (!identifier || !name) {
    return undefined
  }
  return { length: identifier.length, name }
}

type NodeWithValue = ElementContent & Literal
