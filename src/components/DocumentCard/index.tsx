/* eslint-disable react/prop-types */
import { DragHandleIcon } from '@sanity/icons'
import { Box, Card, CardTone, Flex, Stack, useTheme, Text } from '@sanity/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import React from 'react';
import {
  SchemaType,
  useSchema,
  ValidationStatus as ValidationStatusType,
} from 'sanity'
import { Preview } from 'sanity'

import { SanityDocumentWithMetadata, State, User } from '../../types'
import UserDisplay from '../UserDisplay'
import CompleteButton from './CompleteButton'
import { DraftStatus } from './core/DraftStatus'
import { PublishedStatus } from './core/PublishedStatus'
import EditButton from './EditButton'
import Validate from './Validate'
import { ValidationStatus } from './ValidationStatus'
import { useClient } from 'sanity';
import { useCurrentUser } from 'sanity';
import { API_VERSION } from '../../constants'


type DocumentCardProps = {
  isDragDisabled: boolean
  isPatching: boolean
  userRoleCanDrop: boolean
  isDragging: boolean
  item: SanityDocumentWithMetadata
  states: State[]
  toggleInvalidDocumentId: (
    documentId: string,
    action: 'ADD' | 'REMOVE'
  ) => void
  userList: User[]
}

export function DocumentCard(props: DocumentCardProps) {
  const {
    isDragDisabled,
    isPatching,
    userRoleCanDrop,
    isDragging,
    item,
    states,
    toggleInvalidDocumentId,
    userList,
  } = props
  const { assignees = [], documentId } = item._metadata ?? {}
  const schema = useSchema()
  const state = states.find((s) => s.id === item._metadata?.state)

  const isDarkMode = useTheme().sanity.color.dark
  const defaultCardTone = isDarkMode ? `transparent` : `default`


  // Validation only runs if the state requests it
  // Because it's not performant to run it on many documents simultaneously
  // So we fake it here, and maybe set it inside <Validate />
  const [optimisticValidation, setOptimisticValidation] =
    useState<ValidationStatusType>({
      isValidating: state?.requireValidation ?? false,
      validation: [],
    })

  const { isValidating, validation } = optimisticValidation

  const handleValidation = useCallback((updates: ValidationStatusType) => {
    setOptimisticValidation(updates)
  }, [])

  const cardTone = useMemo(() => {
    let tone: CardTone = defaultCardTone

    if (!userRoleCanDrop) return isDarkMode ? `default` : `transparent`
    if (!documentId) return tone
    if (isPatching) tone = isDarkMode ? `default` : `transparent`
    if (isDragging) tone = `positive`

    if (state?.requireValidation && !isValidating && validation.length > 0) {
      if (validation.some((v) => v.level === 'error')) {
        tone = `critical`
      } else {
        tone = `caution`
      }
    }

    return tone
  }, [
    defaultCardTone,
    userRoleCanDrop,
    isPatching,
    isDarkMode,
    documentId,
    isDragging,
    isValidating,
    validation,
    state?.requireValidation,
  ])

  // Update validation status
  // Cannot be done in the above memo because it would set state during render
  useEffect(() => {
    if (!isValidating && validation.length > 0) {
      if (validation.some((v) => v.level === 'error')) {
        toggleInvalidDocumentId(documentId, 'ADD')
      } else {
        toggleInvalidDocumentId(documentId, 'REMOVE')
      }
    } else {
      toggleInvalidDocumentId(documentId, 'REMOVE')
    }
  }, [documentId, isValidating, toggleInvalidDocumentId, validation])

  const hasError = useMemo(
    () => (isValidating ? false : validation.some((v) => v.level === 'error')),
    [isValidating, validation]
  )

  const isLastState = useMemo(
    () => states[states.length - 1].id === item._metadata?.state,
    [states, item._metadata.state]
  )

  const client = useClient({ apiVersion: API_VERSION })
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.roles?.some(role => role.name === '!administrator');
  const isOverdue = item._metadata?.deadline && new Date(item._metadata.deadline as string) < new Date();


  return (
    <>
      {state?.requireValidation ? (
        <Validate
          documentId={documentId}
          type={item._type}
          onChange={handleValidation}
        />
      ) : null}
      <Box paddingBottom={3} paddingX={3}>
        <Card radius={2} shadow={isDragging ? 3 : 1} tone={cardTone}>
          <Stack>
            <Card
              borderBottom
              radius={2}
              paddingRight={2}
              tone={cardTone}
              style={{ pointerEvents: 'none' }}
            >
              <Flex align="center" justify="space-between" gap={1}>
                <Box flex={1}>
                  <Preview
                    layout="default"
                    skipVisibilityCheck
                    value={item}
                    schemaType={schema.get(item._type) as SchemaType}
                  />
                </Box>
                <Box style={{ flexShrink: 0 }}>
                  {hasError || isDragDisabled || isPatching ? null : (
                    <DragHandleIcon />
                  )}
                </Box>
              </Flex>
            </Card>

            <Card padding={2} radius={2} tone="inherit">
              <Flex align="center" justify="space-between" gap={3}>
                <Box flex={1}>
                  {isAdmin ? (
                    <>
                      <Card><Text style={{ color: isOverdue ? 'red' : undefined }} size={2}>Deadline:</Text></Card>
                      <input
                        type="date"
                        defaultValue={(item._metadata.deadline as string)?.slice(0, 16) || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const newDeadline = e.target.value;

                          client
                            .patch(`workflow-metadata.${documentId}`)
                            .set({ deadline: newDeadline })
                            .commit()
                            .catch(console.error);
                        }}
                      />
                    </>
                  ) : (
                    <Card>
                      <Text style={{ color: isOverdue ? 'red' : undefined }} size={2}>Deadline:
                        {item._metadata.deadline
                          ? new Date(item._metadata.deadline as string).toLocaleDateString()
                          : 'No deadline'}
                      </Text>
                    </Card>
                  )}
                </Box>
              </Flex>
            </Card>

            <Card padding={2} radius={2} tone="inherit">

              <Flex align="center" justify="space-between" gap={3}>
                <Box flex={1}>
                  {documentId && (
                    <UserDisplay
                      userList={userList}
                      assignees={assignees}
                      documentId={documentId}
                      disabled={!userRoleCanDrop}
                    />
                  )}
                </Box>
                {validation.length > 0 ? (
                  <ValidationStatus validation={validation} />
                ) : null}
                <DraftStatus document={item} />
                <PublishedStatus document={item} />
                <EditButton
                  id={item._id}
                  type={item._type}
                  disabled={!userRoleCanDrop}
                />
                {isLastState && states.length <= 3 ? (
                  <CompleteButton
                    documentId={documentId}
                    type={item._type}
                    disabled={!userRoleCanDrop}
                  />
                ) : null}
              </Flex>
              {isLastState && states.length > 3 ? (
                <Stack paddingTop={2}>
                  <CompleteButton
                    documentId={documentId}
                    type={item._type}
                    disabled={!userRoleCanDrop}
                  />
                </Stack>
              ) : null}
            </Card>
          </Stack>
        </Card>
      </Box>
    </>
  )
}
