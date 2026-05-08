import { useMemo } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import {
  RowContextMenuContentRenderer,
  RowContextMenuItem,
} from './row-context-menu'
import { HoverActionDropdownMenu } from './hover-action-dropdown-menu'
import { Button } from './ui/button'
import { ContextMenu, ContextMenuTrigger } from './ui/context-menu'
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

interface ActionTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  actions: Action<T>[]
}

export interface Action<T> {
  label: string | React.ReactNode
  dynamicLabel?: (item: T) => string | React.ReactNode
  onClick: (item: T) => void
  shouldDisable?: (item: T) => boolean
}

export function ActionTable<T>({
  data,
  columns,
  actions,
}: ActionTableProps<T>) {
  const { t } = useTranslation()
  const tableColumns = useMemo(() => {
    if (actions.length > 0) {
      const actionColumn: ColumnDef<T> = {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <div className="text-right">
            <HoverActionDropdownMenu
              trigger={
                <Button variant="ghost" size="sm">
                  •••
                </Button>
              }
              content={
                <DropdownMenuContent align="end">
                  {actions.map((action, index) => (
                    <DropdownMenuItem
                      key={index}
                      disabled={action.shouldDisable?.(row.original)}
                      onClick={() => action.onClick(row.original)}
                      className="gap-2"
                    >
                      {action.dynamicLabel
                        ? action.dynamicLabel(row.original)
                        : action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              }
            />
          </div>
        ),
      }
      return [...columns, actionColumn]
    }
    return columns
  }, [actions, columns, t])

  const table = useReactTable<T>({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const getRowContextMenuItems = useMemo(() => {
    if (actions.length === 0) {
      return undefined
    }

    return (item: T): RowContextMenuItem<T>[] =>
      actions.map((action, index) => ({
        key: `action-${index}`,
        label: action.dynamicLabel ? action.dynamicLabel(item) : action.label,
        disabled: action.shouldDisable?.(item) ?? false,
        onSelect: action.onClick,
      }))
  }, [actions])

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.id === 'actions' ? 'text-right' : ''}
                >
                  {header.isPlaceholder
                    ? null
                    : (header.column.columnDef.header as React.ReactNode)}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const contextMenuItems =
              getRowContextMenuItems?.(row.original) ?? []

            const rowContent = (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {cell.column.columnDef.cell
                      ? flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )
                      : String(cell.getValue() || '-')}
                  </TableCell>
                ))}
              </TableRow>
            )

            if (contextMenuItems.length === 0) {
              return rowContent
            }

            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
                <RowContextMenuContentRenderer
                  item={row.original}
                  items={contextMenuItems}
                />
              </ContextMenu>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
