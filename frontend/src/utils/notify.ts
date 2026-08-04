import { toast, type ToastOptions } from "react-toastify";

const defaults: ToastOptions = {
  position: "top-right",
  autoClose: 3500,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export function notifySuccess(message: string, options?: ToastOptions) {
  return toast.success(message, { ...defaults, ...options });
}

export function notifyError(message: string, options?: ToastOptions) {
  return toast.error(message, { ...defaults, ...options });
}

export function notifyInfo(message: string, options?: ToastOptions) {
  return toast.info(message, { ...defaults, ...options });
}
