import React, { useLayoutEffect, useRef, useState } from 'react'
import {
  flexRender,
  PaginationState,
  Table as TableInstance,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ColumnFilterPopover } from '@/components/column-filter-popover'
import {
  RowContextMenuContentRenderer,
  RowContextMenuItem,
} from '@/components/row-context-menu'

interface ResourceTableViewProps<T> {
  table: TableInstance<T>
  columnCount: number
  isLoading: boolean
  data?: T[]
  allPageSize?: number
  maxBodyHeightClassName?: string
  containerClassName?: string
  fitViewportHeight?: boolean
  emptyState: React.ReactNode
  hasActiveFilters: boolean
  filteredRowCount: number
  totalRowCount: number
  searchQuery: string
  pagination: PaginationState
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>
  getRowContextMenuItems?: (item: T) => RowContextMenuItem<T>[]
}

type ColumnAlignment = 'left' | 'center' | 'right'

function getColumnAlignmentClassName(
  alignment: ColumnAlignment | undefined,
  index: number
) {
  const resolvedAlignment = alignment ?? (index <= 1 ? 'left' : 'center')

  switch (resolvedAlignment) {
    case 'right':
      return 'text-right'
    case 'center':
      return 'text-center'
    case 'left':
    default:
      return 'text-left'
  }
}

function getHeaderContentAlignmentClassName(
  alignment: ColumnAlignment | undefined,
  index: number
) {
  const resolvedAlignment = alignment ?? (index <= 1 ? 'left' : 'center')

  switch (resolvedAlignment) {
    case 'right':
      return 'justify-end'
    case 'center':
      return 'justify-center'
    case 'left':
    default:
      return 'justify-start'
  }
}

export function ResourceTableView<T>({
  table,
  columnCount,
  isLoading,
  data,
  allPageSize,
  maxBodyHeightClassName = 'max-h-[calc(100dvh-210px)]',
  containerClassName = 'flex flex-col gap-3',
  fitViewportHeight = false,
  emptyState,
  hasActiveFilters,
  filteredRowCount,
  totalRowCount,
  searchQuery,
  pagination,
  setPagination,
  getRowContextMenuItems,
}: ResourceTableViewProps<T>) {
  const { t } = useTranslation()
  const getStickyColumnClassName = (
    index: number,
    columnId: string,
    alignment: ColumnAlignment | undefined,
    isHeader = false
  ) =>
    cn(
      getColumnAlignmentClassName(alignment, index),
      columnId === 'actions' &&
        'sticky right-0 z-20 bg-background shadow-[-10px_0_12px_-12px_color-mix(in_oklab,var(--color-foreground)_16%,transparent)]',
      isHeader && columnId === 'actions' && 'z-30'
    )

  const renderRows = () => {
    const rows = table.getRowModel().rows

    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={columnCount} className="h-24 text-center">
            {t('resourceTableView.noResults')}
          </TableCell>
        </TableRow>
      )
    }

    return rows.map((row) => {
      const contextMenuItems = getRowContextMenuItems?.(row.original) ?? []

      const rowContent = (
        <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
          {row.getVisibleCells().map((cell, index) => (
            <TableCell
              key={cell.id}
              className={cn(
                'align-middle',
                getStickyColumnClassName(
                  index,
                  cell.column.id,
                  (
                    cell.column.columnDef.meta as
                      | { align?: ColumnAlignment }
                      | undefined
                  )?.align
                )
              )}
            >
              {cell.column.columnDef.cell
                ? flexRender(cell.column.columnDef.cell, cell.getContext())
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
    })
  }

  const dataLength = data?.length ?? 0
  const resolvedAllPageSize = allPageSize ?? dataLength
  const rootRef = useRef<HTMLDivElement>(null)
  const tableShellRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [tableHeight, setTableHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!fitViewportHeight || !tableShellRef.current) {
      return
    }

    let frameId = 0
    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdate()
    })

    const updateHeight = () => {
      if (!tableShellRef.current) {
        return
      }

      const tableTop = tableShellRef.current.getBoundingClientRect().top
      const footerHeight =
        footerRef.current?.getBoundingClientRect().height ?? 0
      const footerGap = dataLength > 0 ? 12 : 0
      const nextHeight = Math.max(
        240,
        Math.floor(window.innerHeight - tableTop - footerHeight - footerGap)
      )

      setTableHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      )
    }

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(updateHeight)
    }

    scheduleUpdate()
    window.addEventListener('resize', scheduleUpdate)
    resizeObserver.observe(tableShellRef.current)
    if (footerRef.current) {
      resizeObserver.observe(footerRef.current)
    }
    if (rootRef.current?.parentElement) {
      resizeObserver.observe(rootRef.current.parentElement)
    }

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleUpdate)
      resizeObserver.disconnect()
    }
  }, [dataLength, fitViewportHeight])

  return (
    <div ref={rootRef} className={containerClassName}>
      <div ref={tableShellRef} className="rounded-lg border overflow-hidden">
        <div
          className={`transition-opacity duration-200 ${
            isLoading && dataLength > 0 ? 'opacity-75' : 'opacity-100'
          }`}
        >
          {emptyState || (
            <div
              className={cn(
                'relative overflow-auto scrollbar-hide',
                fitViewportHeight ? 'min-h-[240px]' : maxBodyHeightClassName
              )}
              style={
                fitViewportHeight && tableHeight
                  ? { height: `${tableHeight}px` }
                  : undefined
              }
            >
              <Table>
                <TableHeader className="bg-muted">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header, index) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            'group/header',
                            getStickyColumnClassName(
                              index,
                              header.column.id,
                              (
                                header.column.columnDef.meta as
                                  | { align?: ColumnAlignment }
                                  | undefined
                              )?.align,
                              true
                            )
                          )}
                        >
                          {header.isPlaceholder ? null : (
                            <div
                              className={cn(
                                'flex items-center gap-0.5',
                                getHeaderContentAlignmentClassName(
                                  (
                                    header.column.columnDef.meta as
                                      | { align?: ColumnAlignment }
                                      | undefined
                                  )?.align,
                                  index
                                )
                              )}
                            >
                              {header.column.getCanSort() ? (
                                <Button
                                  variant="ghost"
                                  onClick={header.column.getToggleSortingHandler()}
                                  className={
                                    header.column.getIsSorted()
                                      ? 'text-primary'
                                      : ''
                                  }
                                >
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                                  {header.column.getIsSorted() === 'asc' ? (
                                    <ArrowUp className="ml-1 h-3.5 w-3.5" />
                                  ) : header.column.getIsSorted() === 'desc' ? (
                                    <ArrowDown className="ml-1 h-3.5 w-3.5" />
                                  ) : (
                                    <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-0 group-hover/header:opacity-50" />
                                  )}
                                </Button>
                              ) : (
                                flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )
                              )}
                              {header.column.getCanFilter() &&
                                header.column.id !== 'select' && (
                                  <ColumnFilterPopover column={header.column} />
                                )}
                            </div>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="**:data-[slot=table-cell]:first:w-0">
                  {renderRows()}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {dataLength > 0 && (
        <div
          ref={footerRef}
          className="flex flex-col gap-3 px-2 py-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {hasActiveFilters ? (
              <>
                {t('resourceTableView.showingRows', {
                  filtered: filteredRowCount,
                  total: totalRowCount,
                })}
                {searchQuery && (
                  <span className="ml-1">
                    (
                    {t('resourceTableView.filteredBy', {
                      query: searchQuery,
                    })}
                    )
                  </span>
                )}
              </>
            ) : (
              t('resourceTableView.rowsTotal', { total: totalRowCount })
            )}
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 lg:w-fit">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <span className="text-sm text-muted-foreground">
                {t('resourceTableView.rowsPerPage')}
              </span>
              <Select
                value={pagination.pageSize.toString()}
                onValueChange={(value) => {
                  setPagination((prev) => ({
                    ...prev,
                    pageSize: Number(value),
                    pageIndex: 0,
                  }))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                  {resolvedAllPageSize > 0 && (
                    <SelectItem value={`${resolvedAllPageSize}`}>
                      {t('resourceTableView.all')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-center text-sm font-medium">
              {t('resourceTableView.pageOf', {
                current: pagination.pageIndex + 1,
                total: table.getPageCount() || 1,
              })}
            </div>
            <div className="flex items-center justify-end gap-2 sm:justify-start lg:ml-0">
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">
                  {t('resourceTableView.previousPage')}
                </span>
                ←
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">
                  {t('resourceTableView.nextPage')}
                </span>
                →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
