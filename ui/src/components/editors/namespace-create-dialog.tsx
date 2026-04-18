import { useEffect, useState, type FormEvent } from 'react'
import type { Namespace } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { createResource } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NamespaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (namespace: Namespace) => void
}

export function NamespaceCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: NamespaceCreateDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setIsCreating(false)
    }
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      return
    }

    setIsCreating(true)

    try {
      const createdNamespace = await createResource('namespaces', undefined, {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: trimmedName,
        },
      })

      toast.success(
        t('namespaceCreateDialog.success', {
          name: createdNamespace.metadata?.name || trimmedName,
        })
      )
      onOpenChange(false)
      onSuccess(createdNamespace)
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('namespaceCreateDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('namespaceCreateDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="namespace-name">{t('common.name')}</Label>
            <Input
              id="namespace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namespaceCreateDialog.namePlaceholder')}
              autoComplete="off"
              autoFocus
            />
            <p className="text-muted-foreground text-sm">
              {t('namespaceCreateDialog.nameHint')}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? t('common.creating') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
