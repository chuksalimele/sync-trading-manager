interface TaskCompletion{
    OnComplete(response: TSuccess| TCancel| TError, arg:void):void;
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