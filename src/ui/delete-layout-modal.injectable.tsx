import { Span } from "@k8slens/element-components";
import { DangerButton, PlainButton } from "@k8slens/input-components";
import {
  ModalContainer,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@k8slens/modal-components";
import {
  getModalInjectableBunch,
  getModalKind,
  type ModalProps,
  useRespondFromModal,
} from "@k8slens/modal-contracts";
import { ModalErrorBoundary } from "./modal-error-boundary";

// Asks whether to delete the layout of the name, answering true to delete it.
export const deleteLayoutModalKind = getModalKind<[name: string], boolean>()(
  "delete-layout",
);

const DeleteLayoutModal = ({
  input: [name],
}: ModalProps<typeof deleteLayoutModalKind>) => {
  const respond = useRespondFromModal(deleteLayoutModalKind);

  return (
    <ModalContainer
      $style={{ width: "calc(var(--unit) * 90)", maxWidth: "90vw" }}
    >
      <ModalHeader onClose={() => respond(false)}>Delete layout</ModalHeader>

      <ModalContent>
        <Span>
          Delete <Span $font={{ bold: true }}>{name}</Span>? Where its windows
          go and its tiling are lost.
        </Span>
      </ModalContent>

      <ModalFooter>
        <PlainButton onClick={() => respond(false)}>Cancel</PlainButton>
        <DangerButton autoFocus onClick={() => respond(true)}>
          Delete
        </DangerButton>
      </ModalFooter>
    </ModalContainer>
  );
};

// Answers no when the extension was updated while it was open, so nothing is deleted unasked.
const OutOfDateModal = () => {
  const respond = useRespondFromModal(deleteLayoutModalKind);

  return (
    <ModalContainer
      $style={{ width: "calc(var(--unit) * 90)", maxWidth: "90vw" }}
    >
      <ModalHeader onClose={() => respond(false)}>Delete layout</ModalHeader>
      <ModalContent>
        <Span>
          This dialog stopped working, most likely because the extension was
          updated while it was open.
        </Span>
      </ModalContent>
      <ModalFooter>
        <PlainButton onClick={() => respond(false)}>Close</PlainButton>
      </ModalFooter>
    </ModalContainer>
  );
};

const GuardedDeleteLayoutModal = (
  props: ModalProps<typeof deleteLayoutModalKind>,
) => (
  <ModalErrorBoundary fallback={() => <OutOfDateModal />}>
    <DeleteLayoutModal {...props} />
  </ModalErrorBoundary>
);

export const deleteLayoutModalBunch = getModalInjectableBunch({
  kind: deleteLayoutModalKind,
  Component: GuardedDeleteLayoutModal,
  onClose: () => false,
});
