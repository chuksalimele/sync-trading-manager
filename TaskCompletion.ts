interface TaskCompletion{
    OnComplete(response: TResult, arg:void):void;
}


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