interface TaskCompletion{
    OnComplete(response: TResult, arg:void):void;
}

type TResult = TSuccess|TCancel|TError;

interface TSuccess{
    success:string;
    value:any;
}

interface TCancel{
    cancel:string;
}

interface TError{
    error:string;
}